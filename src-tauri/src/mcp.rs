//! Integracion con clientes MCP (Claude Desktop y Claude Code).
//!
//! Conecta el binario `pudureport-mcp` (scoped al workspace abierto) al cliente
//! de IA del usuario. Todo reversible: "Desconectar" quita la entrada.
//!
//! - **Claude Desktop**: se escribe/quita la entrada `mcpServers` en
//!   `claude_desktop_config.json` (merge cuidadoso, sin tocar otras entradas).
//! - **Claude Code**: se usa su CLI (`claude mcp add/remove`), porque Claude Code
//!   reescribe `~/.claude.json` constantemente y editarlo a mano podria pisarse
//!   con sus escrituras. El status se lee del archivo (solo lectura, sin race).
//!
//! Importante: conectar expone el TEXTO de los hallazgos al cliente de IA. El
//! consentimiento se pide en la GUI antes.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use serde_json::{json, Value};

/// Clave de la entrada en `mcpServers`. Identifica este servidor en el config.
const SERVER_KEY: &str = "pudureport";

/// Cliente MCP soportado.
#[derive(Clone, Copy)]
pub enum McpClient {
    Desktop,
    Code,
}

impl McpClient {
    /// Parsea el identificador que llega desde el frontend.
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "desktop" => Ok(McpClient::Desktop),
            "code" => Ok(McpClient::Code),
            other => Err(format!("cliente MCP desconocido: {other}")),
        }
    }
}

/// Estado de la integracion con un cliente MCP, para mostrar en la GUI.
#[derive(Serialize)]
pub struct McpStatus {
    /// El config del cliente ya tiene la entrada de PuduReport.
    pub installed: bool,
    /// La entrada apunta al workspace actualmente abierto.
    pub points_to_current: bool,
    /// Ruta del config del cliente (exista o no el archivo).
    pub config_path: String,
    /// Se encontro el binario `pudureport-mcp` junto a la app.
    pub binary_found: bool,
    /// Para Claude Code: se encontro el CLI `claude` para conectar/desconectar.
    /// Para Claude Desktop siempre es true (no necesita CLI).
    pub cli_available: bool,
}

/// Ruta del config del cliente segun el OS.
/// - Desktop: `dirs::config_dir()/Claude/claude_desktop_config.json`
///   (`~/Library/Application Support` en macOS, `%APPDATA%` en Windows,
///   `~/.config` en Linux).
/// - Code: `~/.claude.json`.
fn config_path(client: McpClient) -> Result<PathBuf, String> {
    match client {
        McpClient::Desktop => {
            let base = dirs::config_dir().ok_or_else(|| {
                "no se pudo determinar el directorio de configuracion".to_string()
            })?;
            Ok(base.join("Claude").join("claude_desktop_config.json"))
        }
        McpClient::Code => {
            let home =
                dirs::home_dir().ok_or_else(|| "no se pudo determinar el HOME".to_string())?;
            Ok(home.join(".claude.json"))
        }
    }
}

/// Localiza el binario `pudureport-mcp` junto al ejecutable de la app (como
/// sidecar en produccion y en target/debug durante el desarrollo).
fn resolve_mcp_binary() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe
        .parent()
        .ok_or_else(|| "no se pudo resolver el directorio del ejecutable".to_string())?;
    let name = if cfg!(windows) {
        "pudureport-mcp.exe"
    } else {
        "pudureport-mcp"
    };
    let candidate = dir.join(name);
    if candidate.is_file() {
        Ok(candidate)
    } else {
        Err(format!(
            "no se encontro el binario pudureport-mcp junto a la app: {}",
            candidate.display()
        ))
    }
}

/// Localiza el CLI `claude` de Claude Code. Las apps de GUI no heredan el PATH
/// del shell, asi que se prueban las ubicaciones tipicas de instalacion.
fn resolve_claude_cli() -> Result<PathBuf, String> {
    let exe = if cfg!(windows) {
        "claude.exe"
    } else {
        "claude"
    };
    if let Some(home) = dirs::home_dir() {
        for rel in [".local/bin", ".claude/local"] {
            let p = home.join(rel).join(exe);
            if p.is_file() {
                return Ok(p);
            }
        }
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let p = Path::new(dir).join(exe);
        if p.is_file() {
            return Ok(p);
        }
    }
    Err(
        "no se encontro el CLI de Claude Code (claude). Instalalo o conectalo a mano \
         con: claude mcp add pudureport -s user -- <ruta-pudureport-mcp> <workspace>"
            .to_string(),
    )
}

/// Lee el config del cliente como JSON. Si no existe, devuelve un objeto vacio.
/// Si existe pero no es JSON valido, falla en vez de pisarlo.
fn read_config(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&content)
        .map_err(|e| format!("el config del cliente no es JSON valido ({path:?}): {e}"))
}

/// Escribe el config con indentacion, creando el directorio si falta.
fn write_config(path: &Path, root: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(root).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Devuelve el estado actual de la integracion para el workspace dado.
/// El status se obtiene leyendo el config (sin escribir), igual para ambos
/// clientes: ambos guardan `mcpServers.pudureport` con el workspace en `args[0]`.
pub fn status(client: McpClient, workspace: &Path) -> Result<McpStatus, String> {
    let config_path = config_path(client)?;
    let binary_found = resolve_mcp_binary().is_ok();
    let cli_available = match client {
        McpClient::Desktop => true,
        McpClient::Code => resolve_claude_cli().is_ok(),
    };
    let root = read_config(&config_path).unwrap_or_else(|_| json!({}));
    let entry = root.get("mcpServers").and_then(|s| s.get(SERVER_KEY));
    let installed = entry.is_some();
    let points_to_current = entry
        .and_then(|e| e.get("args"))
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .map(|p| Path::new(p) == workspace)
        .unwrap_or(false);
    Ok(McpStatus {
        installed,
        points_to_current,
        config_path: config_path.display().to_string(),
        binary_found,
        cli_available,
    })
}

/// Conecta el workspace al cliente. No toca otras entradas del config.
pub fn connect(client: McpClient, workspace: &Path) -> Result<(), String> {
    let binary = resolve_mcp_binary()?;
    match client {
        McpClient::Desktop => connect_desktop(&binary, workspace),
        McpClient::Code => connect_code(&binary, workspace),
    }
}

/// Desconecta: quita la entrada de PuduReport del cliente (reversible).
pub fn disconnect(client: McpClient) -> Result<(), String> {
    match client {
        McpClient::Desktop => disconnect_desktop(),
        McpClient::Code => disconnect_code(),
    }
}

// --- Claude Desktop: merge directo del JSON ---

fn connect_desktop(binary: &Path, workspace: &Path) -> Result<(), String> {
    let path = config_path(McpClient::Desktop)?;
    let mut root = read_config(&path)?;
    let obj = root
        .as_object_mut()
        .ok_or_else(|| "el config del cliente no es un objeto JSON".to_string())?;
    let servers = obj
        .entry("mcpServers")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "mcpServers no es un objeto JSON".to_string())?;
    servers.insert(
        SERVER_KEY.to_string(),
        json!({
            "command": binary.to_string_lossy(),
            "args": [workspace.to_string_lossy()],
        }),
    );
    write_config(&path, &root)
}

fn disconnect_desktop() -> Result<(), String> {
    let path = config_path(McpClient::Desktop)?;
    if !path.exists() {
        return Ok(());
    }
    let mut root = read_config(&path)?;
    if let Some(servers) = root.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
        servers.remove(SERVER_KEY);
    }
    write_config(&path, &root)
}

// --- Claude Code: a traves de su CLI (evita el race con sus escrituras) ---

fn run_claude(cli: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(cli)
        .args(args)
        .output()
        .map_err(|e| e.to_string())
}

fn connect_code(binary: &Path, workspace: &Path) -> Result<(), String> {
    let cli = resolve_claude_cli()?;
    let bin = binary.to_string_lossy().to_string();
    let ws = workspace.to_string_lossy().to_string();
    // Quitar primero (claude mcp add falla si ya existe); se ignora el error.
    let _ = run_claude(&cli, &["mcp", "remove", SERVER_KEY, "-s", "user"]);
    let out = run_claude(
        &cli,
        &["mcp", "add", SERVER_KEY, "-s", "user", "--", &bin, &ws],
    )?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn disconnect_code() -> Result<(), String> {
    let cli = resolve_claude_cli()?;
    let out = run_claude(&cli, &["mcp", "remove", SERVER_KEY, "-s", "user"])?;
    // `remove` de algo que no existe devuelve error; se considera ya desconectado.
    let _ = out;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_paths_por_cliente() {
        let desktop = config_path(McpClient::Desktop).unwrap();
        assert!(desktop.ends_with("Claude/claude_desktop_config.json"));
        let code = config_path(McpClient::Code).unwrap();
        assert!(code.ends_with(".claude.json"));
    }

    #[test]
    fn parse_cliente() {
        assert!(matches!(
            McpClient::parse("desktop"),
            Ok(McpClient::Desktop)
        ));
        assert!(matches!(McpClient::parse("code"), Ok(McpClient::Code)));
        assert!(McpClient::parse("otro").is_err());
    }

    /// El merge de Claude Desktop preserva otras entradas y no pisa JSON invalido.
    #[test]
    fn desktop_merge_preserva_otras_entradas() {
        let tmp = std::env::temp_dir().join(format!("pudu-mcp-cfg-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let cfg = tmp.join("claude_desktop_config.json");
        write_config(
            &cfg,
            &json!({ "mcpServers": { "otro": { "command": "x" } } }),
        )
        .unwrap();

        // Simula el insert de connect_desktop (resolve_mcp_binary depende del exe).
        let mut root = read_config(&cfg).unwrap();
        root.as_object_mut()
            .unwrap()
            .entry("mcpServers")
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .unwrap()
            .insert(
                SERVER_KEY.to_string(),
                json!({ "command": "bin", "args": ["/ws"] }),
            );
        write_config(&cfg, &root).unwrap();

        let after = read_config(&cfg).unwrap();
        assert!(after["mcpServers"][SERVER_KEY].is_object());
        assert_eq!(after["mcpServers"]["otro"]["command"], "x");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn invalid_json_is_not_clobbered() {
        let tmp = std::env::temp_dir().join(format!("pudu-mcp-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let cfg = tmp.join("claude_desktop_config.json");
        fs::write(&cfg, "{ no es json ").unwrap();
        assert!(read_config(&cfg).is_err());
        let _ = fs::remove_dir_all(&tmp);
    }
}
