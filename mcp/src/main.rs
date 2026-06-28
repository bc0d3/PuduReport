// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Servidor MCP de PuduReport (transporte stdio).
//!
//! Expone el workspace por stdio (JSON-RPC) para que la IA del usuario lea y
//! mejore reportes. No embebe ningun LLM ni abre puertos de red: el cliente MCP
//! lanza este proceso y le habla por pipes, asi que solo el usuario local
//! accede (ver README.dev.md).
//!
//! Alcance actual (Fase 2): leer proyectos e hallazgos y modificar el TEXTO de
//! los hallazgos (crear vulnerabilidades, mejorar redaccion/campos). Puede SUBIR
//! imagenes nuevas al proyecto (upload_asset) para ilustrar el reporte, con
//! guardarrailes (solo imagenes, anti-traversal, tope de tamano), pero NUNCA lee
//! evidencias existentes: no expone bytes de assets. No edita plantillas ni
//! configuracion (workspace.yaml, branding, tipo de proyecto) ni borra nada.

use std::path::PathBuf;

use base64::Engine;
use pudureport_core::cvss;
use pudureport_core::models::{CvssVersion, FindingMeta, FindingStatus, Severity};
use pudureport_core::workspace;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{ServerCapabilities, ServerInfo};
use rmcp::transport::stdio;
use rmcp::{
    tool, tool_handler, tool_router, ErrorData as McpError, Json, ServerHandler, ServiceExt,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// De donde sale el workspace que expone el servidor.
#[derive(Clone)]
enum WorkspaceSource {
    /// Workspace fijo: override por entorno (PUDUREPORT_WORKSPACE) o en tests.
    Fixed(PathBuf),
    /// Sigue el workspace abierto en la app: lee settings.json del store en cada
    /// llamada. `fallback` es el argumento de instalacion (legacy), usado solo si
    /// no hay app/ajustes.
    Follow { fallback: Option<PathBuf> },
}

/// Servidor MCP scoped a UN workspace por vez. Por defecto SIGUE el workspace
/// abierto en la app (lee settings.json en cada llamada), asi refleja en vivo el
/// que el usuario tiene abierto en el GUI. Nunca ve nada fuera de ese workspace.
#[derive(Clone)]
struct PuduReportServer {
    source: WorkspaceSource,
}

// --- Argumentos de las herramientas ---

/// Identifica un proyecto del workspace.
#[derive(Debug, Deserialize, JsonSchema)]
struct ProjectIdArgs {
    /// Id del proyecto (carpeta dentro del workspace).
    project_id: String,
}

/// Identifica un hallazgo dentro de un proyecto.
#[derive(Debug, Deserialize, JsonSchema)]
struct FindingIdArgs {
    /// Id del proyecto.
    project_id: String,
    /// Id del hallazgo (nombre del archivo .md sin extension).
    finding_id: String,
}

/// Busca hallazgos por texto dentro de un proyecto.
#[derive(Debug, Deserialize, JsonSchema)]
struct SearchArgs {
    /// Id del proyecto.
    project_id: String,
    /// Texto a buscar en el titulo o el cuerpo (sin distinguir mayusculas).
    query: String,
}

/// Argumentos de `upload_asset`. Sube una imagen al proyecto. SOLO escribe.
#[derive(Debug, Deserialize, JsonSchema)]
struct UploadAssetArgs {
    /// Id del proyecto donde guardar la imagen.
    project_id: String,
    /// Nombre de referencia, p.ej. "captura-login.png". SOLO se usa para tomar la
    /// extension; el archivo se guarda con un id unico generado por el servidor.
    filename: String,
    /// Contenido binario de la imagen codificado en base64.
    data_base64: String,
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

/// Crea un hallazgo (vulnerabilidad) nuevo en un proyecto.
#[derive(Debug, Deserialize, JsonSchema)]
struct CreateFindingArgs {
    /// Id del proyecto donde crear el hallazgo.
    project_id: String,
    /// Titulo del hallazgo.
    title: String,
    /// Cuerpo markdown (Descripcion/Impacto/PoC/Remediacion). Si se omite, se
    /// usa el scaffold de secciones vacias.
    body: Option<String>,
    /// Vector CVSS; la severidad y el puntaje se derivan de el. Ignorado en
    /// tipos de examen (oscp/htb).
    cvss_vector: Option<String>,
    /// Version del vector ("3.1" | "4.0"). Por defecto la del hallazgo.
    cvss_version: Option<String>,
    /// Severidad cualitativa, SOLO para tipos de examen (oscp/htb).
    severity: Option<String>,
    /// Identificadores CWE, por ejemplo ["CWE-89", "CWE-200"].
    cwe: Option<Vec<String>>,
    /// Estado de remediacion: open | fixed | accepted | wontfix.
    status: Option<String>,
    /// Recursos afectados (URLs, hosts, endpoints).
    affected: Option<Vec<String>>,
}

/// Actualiza el texto y los campos de un hallazgo existente. Los campos
/// omitidos no se tocan; el id (y el archivo) no se renombra al cambiar titulo.
#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateFindingArgs {
    /// Id del proyecto.
    project_id: String,
    /// Id del hallazgo a actualizar.
    finding_id: String,
    /// Nuevo titulo.
    title: Option<String>,
    /// Nuevo cuerpo markdown completo.
    body: Option<String>,
    /// Nuevo vector CVSS; la severidad y el puntaje se derivan de el. Ignorado
    /// en tipos de examen (oscp/htb).
    cvss_vector: Option<String>,
    /// Version del vector ("3.1" | "4.0").
    cvss_version: Option<String>,
    /// Severidad cualitativa, SOLO para tipos de examen (oscp/htb).
    severity: Option<String>,
    /// Identificadores CWE, por ejemplo ["CWE-89", "CWE-200"].
    cwe: Option<Vec<String>>,
    /// Estado de remediacion: open | fixed | accepted | wontfix.
    status: Option<String>,
    /// Recursos afectados (URLs, hosts, endpoints).
    affected: Option<Vec<String>>,
}

// --- Resultados estructurados ---

/// Resultado de `calc_cvss`.
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

// --- Helpers ---

/// Mapea un error de dominio a un error MCP interno.
fn internal(e: impl std::fmt::Display) -> McpError {
    McpError::internal_error(e.to_string(), None)
}

/// Serializa un valor del dominio a JSON (texto) para la salida de una
/// herramienta. Se devuelve como texto y no como salida estructurada porque los
/// modelos de `pudureport-core` no derivan `JsonSchema` y rmcp exige que el
/// outputSchema tenga raiz `object`; el texto JSON evita duplicar cada struct.
fn to_json<T: Serialize>(value: &T) -> Result<String, McpError> {
    serde_json::to_string_pretty(value).map_err(internal)
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

/// Parsea la version del estandar CVSS desde su etiqueta.
fn parse_cvss_version(label: &str) -> Result<CvssVersion, McpError> {
    match label.trim() {
        "3.1" => Ok(CvssVersion::V31),
        "4.0" => Ok(CvssVersion::V40),
        other => Err(McpError::invalid_params(
            format!("version CVSS no soportada: {other} (use \"3.1\" o \"4.0\")"),
            None,
        )),
    }
}

/// Parsea el estado de remediacion del hallazgo.
fn parse_status(label: &str) -> Result<FindingStatus, McpError> {
    match label.trim() {
        "open" => Ok(FindingStatus::Open),
        "fixed" => Ok(FindingStatus::Fixed),
        "accepted" => Ok(FindingStatus::Accepted),
        "wontfix" => Ok(FindingStatus::Wontfix),
        other => Err(McpError::invalid_params(
            format!("estado no valido: {other} (use open|fixed|accepted|wontfix)"),
            None,
        )),
    }
}

/// Parsea una severidad cualitativa (solo valida en tipos de examen).
fn parse_severity(label: &str) -> Result<Severity, McpError> {
    match label.trim() {
        "info" => Ok(Severity::Info),
        "low" => Ok(Severity::Low),
        "medium" => Ok(Severity::Medium),
        "high" => Ok(Severity::High),
        "critical" => Ok(Severity::Critical),
        other => Err(McpError::invalid_params(
            format!("severidad no valida: {other} (use info|low|medium|high|critical)"),
            None,
        )),
    }
}

/// Tipos de examen: usan severidad cualitativa manual, sin CVSS.
fn is_exam_type(project_type: &str) -> bool {
    matches!(project_type, "oscp" | "htb")
}

/// Aplica los campos de severidad respetando la regla del proyecto:
/// - Tipos de examen: severidad cualitativa manual (sin CVSS).
/// - Resto: la severidad se DERIVA del vector CVSS; nunca se fija a mano.
fn apply_severity(
    meta: &mut FindingMeta,
    project_type: &str,
    cvss_version: Option<&str>,
    cvss_vector: Option<&str>,
    severity: Option<&str>,
) -> Result<(), McpError> {
    if is_exam_type(project_type) {
        if let Some(sev) = severity {
            meta.severity = parse_severity(sev)?;
        }
        // Los examenes no usan CVSS; se ignora cualquier vector recibido.
        return Ok(());
    }
    // Fuera de examenes, la severidad no se fija a mano: se deriva del vector.
    if severity.is_some() && cvss_vector.is_none() {
        return Err(McpError::invalid_params(
            "la severidad se deriva del CVSS; envie cvss_vector en vez de severity".to_string(),
            None,
        ));
    }
    if let Some(vector) = cvss_vector {
        let version = match cvss_version {
            Some(v) => parse_cvss_version(v)?,
            None => meta.cvss_version,
        };
        let result = cvss::calc(version, vector)
            .map_err(|e| McpError::invalid_params(e.to_string(), None))?;
        meta.cvss_version = version;
        meta.cvss_vector = result.vector;
        meta.cvss = format!("{:.1}", result.score);
        meta.severity = result.severity;
    }
    Ok(())
}

#[tool_router]
impl PuduReportServer {
    /// Workspace fijo, solo para tests. Resuelve siempre a esta ruta.
    #[cfg(test)]
    fn new(root: PathBuf) -> Self {
        Self {
            source: WorkspaceSource::Fixed(root),
        }
    }

    fn from_source(source: WorkspaceSource) -> Self {
        Self { source }
    }

    /// Resuelve el workspace ACTUAL en cada llamada. En modo Fixed devuelve la
    /// ruta dada; en modo Follow devuelve el workspace abierto en la app
    /// (settings.json del store), o el respaldo si no hay app/ajustes. Asi el MCP
    /// sigue en vivo el workspace que el usuario abre en el GUI.
    fn current_root(&self) -> Result<PathBuf, McpError> {
        match &self.source {
            WorkspaceSource::Fixed(p) => Ok(p.clone()),
            WorkspaceSource::Follow { fallback } => {
                if let Some(p) = app_current_workspace() {
                    if p.is_dir() {
                        return Ok(p);
                    }
                }
                if let Some(p) = fallback {
                    if p.is_dir() {
                        return Ok(p.clone());
                    }
                }
                Err(internal(
                    "no hay un workspace disponible: abri uno en PuduReport",
                ))
            }
        }
    }

    // --- Lectura ---

    /// Devuelve nombre, ruta y cantidad de proyectos del workspace expuesto.
    #[tool(
        description = "Devuelve informacion basica del workspace: nombre, ruta y cantidad de proyectos."
    )]
    async fn get_workspace_info(&self) -> Result<Json<WorkspaceInfo>, McpError> {
        let root = self.current_root()?;
        let meta = workspace::read_workspace_meta(&root).map_err(internal)?;
        let projects = workspace::list_projects(&root).map_err(internal)?;
        Ok(Json(WorkspaceInfo {
            name: meta.name,
            path: root.display().to_string(),
            project_count: projects.len(),
        }))
    }

    /// Lista los proyectos del workspace (resumen liviano).
    #[tool(
        description = "Lista los proyectos del workspace: id, nombre, cliente, tipo y cantidad de hallazgos."
    )]
    async fn list_projects(&self) -> Result<String, McpError> {
        let root = self.current_root()?;
        let projects = workspace::list_projects(&root).map_err(internal)?;
        to_json(&projects)
    }

    /// Devuelve la metadata completa de un proyecto.
    #[tool(
        description = "Devuelve la metadata de un proyecto: datos, secciones de prosa del reporte y orden de hallazgos."
    )]
    async fn get_project(
        &self,
        Parameters(args): Parameters<ProjectIdArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        let meta = workspace::read_project_meta(&root, &args.project_id).map_err(internal)?;
        to_json(&meta)
    }

    /// Lista los hallazgos de un proyecto en el orden del reporte.
    #[tool(
        description = "Lista los hallazgos de un proyecto en el orden del reporte, con su front-matter y cuerpo."
    )]
    async fn list_findings(
        &self,
        Parameters(args): Parameters<ProjectIdArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        let findings = workspace::list_findings(&root, &args.project_id).map_err(internal)?;
        to_json(&findings)
    }

    /// Devuelve un hallazgo completo (front-matter + cuerpo).
    #[tool(
        description = "Devuelve un hallazgo completo: front-matter (severidad, CVSS, CWE, estado) y cuerpo markdown."
    )]
    async fn get_finding(
        &self,
        Parameters(args): Parameters<FindingIdArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        let finding =
            workspace::load_finding(&root, &args.project_id, &args.finding_id).map_err(internal)?;
        to_json(&finding)
    }

    /// Busca hallazgos de un proyecto por texto en titulo o cuerpo.
    #[tool(
        description = "Busca hallazgos de un proyecto cuyo titulo o cuerpo contienen el texto. Devuelve id, titulo, severidad y estado."
    )]
    async fn search_findings(
        &self,
        Parameters(args): Parameters<SearchArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        let needle = args.query.trim().to_lowercase();
        let findings = workspace::list_findings(&root, &args.project_id).map_err(internal)?;
        let hits: Vec<Value> = findings
            .iter()
            .filter(|f| {
                f.meta.title.to_lowercase().contains(&needle)
                    || f.body.to_lowercase().contains(&needle)
            })
            .map(|f| {
                serde_json::json!({
                    "id": f.id,
                    "title": f.meta.title,
                    "severity": severity_label(f.meta.severity),
                    "status": f.meta.status,
                })
            })
            .collect();
        to_json(&Value::Array(hits))
    }

    // --- Escritura (solo texto de hallazgos) ---

    /// Crea un hallazgo (vulnerabilidad) nuevo en un proyecto.
    #[tool(
        description = "Crea un hallazgo (vulnerabilidad) nuevo. La severidad se deriva del cvss_vector; en tipos de examen (oscp/htb) se usa severity manual."
    )]
    async fn create_finding(
        &self,
        Parameters(args): Parameters<CreateFindingArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        let project = workspace::read_project_meta(&root, &args.project_id).map_err(internal)?;
        let mut finding =
            workspace::create_finding(&root, &args.project_id, &args.title).map_err(internal)?;
        if let Some(body) = args.body {
            finding.body = body;
        }
        if let Some(cwe) = args.cwe {
            finding.meta.cwe = cwe;
        }
        if let Some(status) = args.status.as_deref() {
            finding.meta.status = parse_status(status)?;
        }
        if let Some(affected) = args.affected {
            finding.meta.affected = affected;
        }
        apply_severity(
            &mut finding.meta,
            &project.project_type,
            args.cvss_version.as_deref(),
            args.cvss_vector.as_deref(),
            args.severity.as_deref(),
        )?;
        workspace::write_finding(&root, &args.project_id, &finding).map_err(internal)?;
        to_json(&finding)
    }

    /// Actualiza el texto y los campos de un hallazgo existente.
    #[tool(
        description = "Actualiza titulo, cuerpo y campos de un hallazgo. Solo cambia lo que se envia. La severidad se deriva del cvss_vector (salvo tipos de examen)."
    )]
    async fn update_finding(
        &self,
        Parameters(args): Parameters<UpdateFindingArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        let project = workspace::read_project_meta(&root, &args.project_id).map_err(internal)?;
        let mut finding =
            workspace::load_finding(&root, &args.project_id, &args.finding_id).map_err(internal)?;
        if let Some(title) = args.title {
            finding.meta.title = title;
        }
        if let Some(body) = args.body {
            finding.body = body;
        }
        if let Some(cwe) = args.cwe {
            finding.meta.cwe = cwe;
        }
        if let Some(status) = args.status.as_deref() {
            finding.meta.status = parse_status(status)?;
        }
        if let Some(affected) = args.affected {
            finding.meta.affected = affected;
        }
        apply_severity(
            &mut finding.meta,
            &project.project_type,
            args.cvss_version.as_deref(),
            args.cvss_vector.as_deref(),
            args.severity.as_deref(),
        )?;
        workspace::write_finding(&root, &args.project_id, &finding).map_err(internal)?;
        to_json(&finding)
    }

    // --- Escritura de imagenes (assets) ---

    /// Sube una imagen al proyecto para ilustrar el reporte. SOLO escribe; nunca
    /// lee evidencias existentes. Devuelve la ruta relativa para referenciarla.
    #[tool(
        description = "Sube una imagen (captura/evidencia) al proyecto para ilustrar un hallazgo. La guarda en assets/ con un nombre unico generado y DEVUELVE la ruta: usa esa ruta exacta para referenciarla en el cuerpo con ![](assets/...). SOLO escribe imagenes nuevas, NUNCA lee evidencias existentes. Aviso de privacidad: si tu IA corre en la nube, la imagen ya paso por la nube al verla; para trabajo bajo NDA estricto usa un modelo local."
    )]
    async fn upload_asset(
        &self,
        Parameters(args): Parameters<UploadAssetArgs>,
    ) -> Result<String, McpError> {
        let root = self.current_root()?;
        // El proyecto debe existir: no se crean carpetas de proyectos al subir.
        workspace::read_project_meta(&root, &args.project_id).map_err(internal)?;
        // Solo imagenes rasterizadas. Se excluye SVG a proposito: puede llevar
        // scripts/entidades externas (XXE) y no es necesario para evidencias.
        let ext = std::path::Path::new(&args.filename)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        const ALLOWED: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];
        if !ALLOWED.contains(&ext.as_str()) {
            return Err(McpError::invalid_params(
                format!("extension no permitida: {ext} (use png|jpg|jpeg|gif|webp)"),
                None,
            ));
        }
        const MAX_BYTES: usize = 20 * 1024 * 1024;
        // Pre-chequeo sobre el string base64 (crece ~4/3) para no alocar gigas
        // antes de validar el tamano real.
        if args.data_base64.len() > MAX_BYTES / 3 * 4 + 64 {
            return Err(McpError::invalid_params(
                "imagen muy grande (supera el maximo permitido)".to_string(),
                None,
            ));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(args.data_base64.trim())
            .map_err(|e| McpError::invalid_params(format!("base64 invalido: {e}"), None))?;
        if bytes.len() > MAX_BYTES {
            return Err(McpError::invalid_params(
                format!("imagen muy grande: {} bytes (max {MAX_BYTES})", bytes.len()),
                None,
            ));
        }
        // El nombre lo genera el servidor (UUID + extension saneada): la IA NO
        // controla el nombre del archivo, asi que no hay traversal ni sobrescritura
        // posible. Devuelve la ruta para referenciarla en el cuerpo.
        let rel = workspace::save_asset(&root, &args.project_id, &ext, &bytes).map_err(internal)?;
        Ok(rel)
    }

    // --- Calculo ---

    /// Calcula el puntaje y la severidad de un vector CVSS 3.1 o 4.0.
    #[tool(
        description = "Calcula el puntaje CVSS (3.1 o 4.0) de un vector y deriva su severidad. La IA fija el vector; el backend deriva la severidad."
    )]
    async fn calc_cvss(
        &self,
        Parameters(args): Parameters<CalcCvssArgs>,
    ) -> Result<Json<CalcCvssResult>, McpError> {
        let version = parse_cvss_version(&args.version)?;
        let result = cvss::calc(version, &args.vector)
            .map_err(|e| McpError::invalid_params(e.to_string(), None))?;
        Ok(Json(CalcCvssResult {
            score: result.score,
            severity: severity_label(result.severity).to_string(),
            vector: result.vector,
        }))
    }
}

#[tool_handler]
impl ServerHandler for PuduReportServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Servidor MCP de PuduReport. Lee proyectos e hallazgos del workspace expuesto y \
             mejora el texto de los hallazgos (crear vulnerabilidades, redaccion, campos). Puede \
             SUBIR imagenes nuevas al proyecto (upload_asset) para ilustrar el reporte, pero \
             NUNCA lee evidencias existentes: no expone bytes de assets. No edita plantillas ni \
             configuracion.",
        )
    }
}

/// Ruta del settings.json del store de la app (tauri-plugin-store).
/// Cross-plataforma: `config_dir()/com.pudureport.app/settings.json`.
fn app_settings_path() -> Option<PathBuf> {
    Some(
        dirs::config_dir()?
            .join("com.pudureport.app")
            .join("settings.json"),
    )
}

/// Workspace abierto actualmente en la app, leido de su settings.json
/// (`workspace_path`). None si no hay app/ajustes o el campo esta vacio.
fn app_current_workspace() -> Option<PathBuf> {
    let text = std::fs::read_to_string(app_settings_path()?).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let path = json.get("workspace_path")?.as_str()?;
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

/// Decide el origen del workspace. PUDUREPORT_WORKSPACE fija un workspace
/// (override / testing); de lo contrario sigue el workspace abierto en la app,
/// usando el argumento de instalacion como respaldo.
fn build_source() -> WorkspaceSource {
    if let Ok(env) = std::env::var("PUDUREPORT_WORKSPACE") {
        if !env.is_empty() {
            return WorkspaceSource::Fixed(PathBuf::from(env));
        }
    }
    let fallback = std::env::args().nth(1).map(PathBuf::from);
    WorkspaceSource::Follow { fallback }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // No se valida un workspace al arrancar: en modo Follow puede no haber uno
    // abierto todavia. Cada herramienta resuelve el workspace actual al llamarse.
    let service = PuduReportServer::from_source(build_source())
        .serve(stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Crea un workspace temporal con un proyecto y devuelve (root, project_id).
    /// `label` debe ser unico por test para evitar colisiones entre los tests
    /// que corren en paralelo dentro del mismo proceso.
    fn temp_workspace(label: &str, project_type: &str) -> (PathBuf, String) {
        let tmp =
            std::env::temp_dir().join(format!("pudu-mcp-test-{}-{}", label, std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        workspace::create_workspace(&tmp, "WS").unwrap();
        let (id, _) = workspace::create_project(&tmp, "Web", "ACME", project_type).unwrap();
        (tmp, id)
    }

    /// Parsea la salida JSON (texto) de una herramienta.
    fn parse(out: String) -> Value {
        serde_json::from_str(&out).unwrap()
    }

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

    #[tokio::test]
    async fn create_finding_derives_severity_from_cvss() {
        let (root, pid) = temp_workspace("create-cvss", "pentest");
        let srv = PuduReportServer::new(root.clone());
        let value = parse(
            srv.create_finding(Parameters(CreateFindingArgs {
                project_id: pid.clone(),
                title: "SQLi en login".into(),
                body: Some("## Descripcion\n\nInyeccion SQL.".into()),
                cvss_vector: Some("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N".into()),
                cvss_version: Some("3.1".into()),
                severity: None,
                cwe: Some(vec!["CWE-89".into()]),
                status: Some("open".into()),
                affected: Some(vec!["https://app.acme.com/login".into()]),
            }))
            .await
            .expect("creacion valida"),
        );
        assert_eq!(value["meta"]["severity"], "critical");
        assert_eq!(value["meta"]["cvss"], "9.1");
        assert_eq!(value["meta"]["cwe"][0], "CWE-89");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn update_finding_rejects_manual_severity_outside_exams() {
        let (root, pid) = temp_workspace("update-reject", "pentest");
        let srv = PuduReportServer::new(root.clone());
        let created = parse(
            srv.create_finding(Parameters(CreateFindingArgs {
                project_id: pid.clone(),
                title: "Hallazgo".into(),
                body: None,
                cvss_vector: None,
                cvss_version: None,
                severity: None,
                cwe: None,
                status: None,
                affected: None,
            }))
            .await
            .unwrap(),
        );
        let fid = created["id"].as_str().unwrap().to_string();
        let err = srv
            .update_finding(Parameters(UpdateFindingArgs {
                project_id: pid,
                finding_id: fid,
                title: None,
                body: None,
                cvss_vector: None,
                cvss_version: None,
                severity: Some("critical".into()),
                cwe: None,
                status: None,
                affected: None,
            }))
            .await;
        assert!(err.is_err(), "no debe permitir severidad manual sin CVSS");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn exam_type_uses_manual_severity() {
        let (root, pid) = temp_workspace("exam", "oscp");
        let srv = PuduReportServer::new(root.clone());
        let value = parse(
            srv.create_finding(Parameters(CreateFindingArgs {
                project_id: pid,
                title: "Acceso inicial".into(),
                body: None,
                cvss_vector: None,
                cvss_version: None,
                severity: Some("high".into()),
                cwe: None,
                status: None,
                affected: None,
            }))
            .await
            .expect("examen acepta severidad manual"),
        );
        assert_eq!(value["meta"]["severity"], "high");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn update_finding_keeps_id_on_title_change() {
        let (root, pid) = temp_workspace("update-id", "pentest");
        let srv = PuduReportServer::new(root.clone());
        let created = parse(
            srv.create_finding(Parameters(CreateFindingArgs {
                project_id: pid.clone(),
                title: "Titulo viejo".into(),
                body: None,
                cvss_vector: None,
                cvss_version: None,
                severity: None,
                cwe: None,
                status: None,
                affected: None,
            }))
            .await
            .unwrap(),
        );
        let fid = created["id"].as_str().unwrap().to_string();
        let updated = parse(
            srv.update_finding(Parameters(UpdateFindingArgs {
                project_id: pid,
                finding_id: fid.clone(),
                title: Some("Titulo nuevo".into()),
                body: None,
                cvss_vector: None,
                cvss_version: None,
                severity: None,
                cwe: None,
                status: None,
                affected: None,
            }))
            .await
            .unwrap(),
        );
        assert_eq!(updated["id"].as_str().unwrap(), fid);
        assert_eq!(updated["meta"]["title"], "Titulo nuevo");
        let _ = std::fs::remove_dir_all(&root);
    }
}
