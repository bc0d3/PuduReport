//! Integracion con clientes MCP (ej. Claude Desktop).
//!
//! Escribe/quita la entrada `mcpServers` en el config del cliente para conectar
//! el binario `pudureport-mcp` scoped al workspace abierto. Todo reversible: el
//! boton "Desconectar" quita la entrada. No toca ninguna otra entrada del config.
//!
//! Importante (CLAUDE.md, "Servidor MCP"): conectar expone el TEXTO de los
//! hallazgos al cliente de IA del usuario. El consentimiento se pide en la GUI
//! antes de llamar a `connect`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

/// Clave de la entrada en `mcpServers`. Identifica este servidor en el config.
const SERVER_KEY: &str = "pudureport";

/// Estado de la integracion con el cliente MCP, para mostrar en la GUI.
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
}

/// Ruta del `claude_desktop_config.json` segun el OS. `dirs::config_dir()`
/// resuelve a `~/Library/Application Support` (macOS), `%APPDATA%` (Windows) y
/// `~/.config` (Linux), que son las ubicaciones del config de Claude Desktop.
fn claude_config_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .ok_or_else(|| "no se pudo determinar el directorio de configuracion".to_string())?;
    Ok(base.join("Claude").join("claude_desktop_config.json"))
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
pub fn status(workspace: &Path) -> Result<McpStatus, String> {
    let config_path = claude_config_path()?;
    let binary_found = resolve_mcp_binary().is_ok();
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
    })
}

/// Conecta: agrega/actualiza la entrada de PuduReport apuntando al workspace.
/// No toca otras entradas del config.
pub fn connect(workspace: &Path) -> Result<(), String> {
    let binary = resolve_mcp_binary()?;
    let config_path = claude_config_path()?;
    let mut root = read_config(&config_path)?;

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
    write_config(&config_path, &root)
}

/// Desconecta: quita la entrada de PuduReport del config (reversible).
pub fn disconnect() -> Result<(), String> {
    let config_path = claude_config_path()?;
    if !config_path.exists() {
        return Ok(());
    }
    let mut root = read_config(&config_path)?;
    if let Some(servers) = root.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
        servers.remove(SERVER_KEY);
    }
    write_config(&config_path, &root)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// connect/disconnect sobre un config falso, preservando otras entradas.
    #[test]
    fn connect_and_disconnect_preserve_other_servers() {
        let tmp = std::env::temp_dir().join(format!("pudu-mcp-cfg-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let cfg = tmp.join("claude_desktop_config.json");
        // Config previo con otro servidor que no debe tocarse.
        write_config(
            &cfg,
            &json!({ "mcpServers": { "otro": { "command": "x" } } }),
        )
        .unwrap();

        // Simula connect a mano (resolve_mcp_binary depende del ejecutable real).
        let mut root = read_config(&cfg).unwrap();
        let servers = root
            .as_object_mut()
            .unwrap()
            .entry("mcpServers")
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .unwrap();
        servers.insert(
            SERVER_KEY.to_string(),
            json!({ "command": "bin", "args": ["/ws"] }),
        );
        write_config(&cfg, &root).unwrap();

        let after = read_config(&cfg).unwrap();
        assert!(after["mcpServers"][SERVER_KEY].is_object());
        assert_eq!(after["mcpServers"]["otro"]["command"], "x");

        // Quitar la entrada deja el resto intacto.
        let mut root = read_config(&cfg).unwrap();
        root.get_mut("mcpServers")
            .and_then(|s| s.as_object_mut())
            .unwrap()
            .remove(SERVER_KEY);
        write_config(&cfg, &root).unwrap();
        let after = read_config(&cfg).unwrap();
        assert!(after["mcpServers"][SERVER_KEY].is_null());
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
