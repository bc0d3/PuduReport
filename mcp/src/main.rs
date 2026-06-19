//! Servidor MCP de PuduReport (transporte stdio).
//!
//! Expone el workspace por stdio (JSON-RPC) para que la IA del usuario lea y
//! mejore reportes. No embebe ningun LLM ni abre puertos de red: el cliente MCP
//! lanza este proceso y le habla por pipes, asi que solo el usuario local
//! accede (ver CLAUDE.md, seccion "Servidor MCP").
//!
//! Esta es la fase de scaffold (Fase 2, paso 1): valida la integracion con el
//! SDK `rmcp` y el toolchain. Expone solo dos herramientas (`calc_cvss` y
//! `get_workspace_info`); el resto de la superficie disenada se agrega despues.

use std::path::PathBuf;

use pudureport_core::cvss;
use pudureport_core::models::{CvssVersion, Severity};
use pudureport_core::workspace;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{ServerCapabilities, ServerInfo};
use rmcp::transport::stdio;
use rmcp::{
    tool, tool_handler, tool_router, ErrorData as McpError, Json, ServerHandler, ServiceExt,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Servidor MCP scoped a un unico workspace (la carpeta que el cliente pasa por
/// argumento o variable de entorno). No ve nada fuera de esa ruta.
#[derive(Clone)]
struct PuduReportServer {
    root: PathBuf,
}

/// Argumentos de `calc_cvss`. La IA fija el vector; el backend deriva la
/// severidad, manteniendo la regla "severidad derivada del CVSS".
#[derive(Debug, Deserialize, JsonSchema)]
struct CalcCvssArgs {
    /// Version del estandar: "3.1" o "4.0".
    version: String,
    /// Vector CVSS completo, por ejemplo "CVSS:3.1/AV:N/AC:L/...".
    vector: String,
}

/// Resultado estructurado de `calc_cvss`.
#[derive(Debug, Serialize, JsonSchema)]
struct CalcCvssResult {
    /// Puntaje 0.0-10.0.
    score: f64,
    /// Banda de severidad derivada del puntaje.
    severity: String,
    /// Vector normalizado.
    vector: String,
}

/// Informacion basica del workspace expuesto.
#[derive(Debug, Serialize, JsonSchema)]
struct WorkspaceInfo {
    /// Nombre del workspace (de workspace.yaml).
    name: String,
    /// Ruta absoluta de la carpeta del workspace.
    path: String,
    /// Cantidad de proyectos en el workspace.
    project_count: usize,
}

/// Severidad como cadena estable para la salida JSON.
fn severity_label(severity: Severity) -> &'static str {
    match severity {
        Severity::Info => "info",
        Severity::Low => "low",
        Severity::Medium => "medium",
        Severity::High => "high",
        Severity::Critical => "critical",
    }
}

#[tool_router]
impl PuduReportServer {
    fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// Calcula el puntaje y la severidad de un vector CVSS 3.1 o 4.0.
    #[tool(
        description = "Calcula el puntaje CVSS (3.1 o 4.0) de un vector y deriva su severidad. La IA fija el vector; el backend deriva la severidad."
    )]
    async fn calc_cvss(
        &self,
        Parameters(args): Parameters<CalcCvssArgs>,
    ) -> Result<Json<CalcCvssResult>, McpError> {
        let version = match args.version.trim() {
            "3.1" => CvssVersion::V31,
            "4.0" => CvssVersion::V40,
            other => {
                return Err(McpError::invalid_params(
                    format!("version CVSS no soportada: {other} (use \"3.1\" o \"4.0\")"),
                    None,
                ));
            }
        };
        let result = cvss::calc(version, &args.vector)
            .map_err(|e| McpError::invalid_params(e.to_string(), None))?;
        Ok(Json(CalcCvssResult {
            score: result.score,
            severity: severity_label(result.severity).to_string(),
            vector: result.vector,
        }))
    }

    /// Devuelve nombre, ruta y cantidad de proyectos del workspace expuesto.
    #[tool(
        description = "Devuelve informacion basica del workspace: nombre, ruta y cantidad de proyectos."
    )]
    async fn get_workspace_info(&self) -> Result<Json<WorkspaceInfo>, McpError> {
        let meta = workspace::read_workspace_meta(&self.root)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        let projects = workspace::list_projects(&self.root)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(Json(WorkspaceInfo {
            name: meta.name,
            path: self.root.display().to_string(),
            project_count: projects.len(),
        }))
    }
}

#[tool_handler]
impl ServerHandler for PuduReportServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Servidor MCP de PuduReport. Lee y mejora reportes de pentest del workspace \
             expuesto. Solo trabaja con texto: nunca expone bytes de assets ni evidencias.",
        )
    }
}

/// Resuelve la ruta del workspace: primer argumento o variable de entorno
/// PUDUREPORT_WORKSPACE.
fn resolve_workspace_root() -> Result<PathBuf, String> {
    if let Some(arg) = std::env::args().nth(1) {
        return Ok(PathBuf::from(arg));
    }
    if let Ok(env) = std::env::var("PUDUREPORT_WORKSPACE") {
        if !env.is_empty() {
            return Ok(PathBuf::from(env));
        }
    }
    Err("falta la ruta del workspace (primer argumento o PUDUREPORT_WORKSPACE)".to_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = resolve_workspace_root()?;
    if !root.is_dir() {
        return Err(format!(
            "el workspace no existe o no es una carpeta: {}",
            root.display()
        )
        .into());
    }

    let service = PuduReportServer::new(root).serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn calc_cvss_derives_severity_from_vector() {
        let srv = PuduReportServer::new(PathBuf::from("."));
        let Json(result) = srv
            .calc_cvss(Parameters(CalcCvssArgs {
                version: "3.1".into(),
                vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N".into(),
            }))
            .await
            .expect("vector valido");
        assert!((result.score - 9.1).abs() < 0.01, "score: {}", result.score);
        assert_eq!(result.severity, "critical");
    }

    #[tokio::test]
    async fn calc_cvss_rejects_unsupported_version() {
        let srv = PuduReportServer::new(PathBuf::from("."));
        let err = srv
            .calc_cvss(Parameters(CalcCvssArgs {
                version: "2.0".into(),
                vector: "CVSS:2.0/AV:N".into(),
            }))
            .await;
        assert!(err.is_err());
    }
}
