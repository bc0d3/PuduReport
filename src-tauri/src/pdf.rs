//! Pipeline de generacion de PDF.
//!
//! Separacion critica (README.dev.md): datos (`data.json`, generado) vs
//! presentacion (`.typ`, editable). El backend serializa el proyecto a
//! `build/data.json`, copia la plantilla activa a `build/report.typ` y compila
//! con Typst. Cualquier plantilla consume el mismo `data.json`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::markdown;
use crate::models::{Branding, Severity, TeamMember, Watermark};
use crate::workspace;

#[derive(Debug, thiserror::Error)]
pub enum PdfError {
    #[error("error de workspace: {0}")]
    Workspace(#[from] workspace::WorkspaceError),
    #[error("error de entrada/salida: {0}")]
    Io(#[from] std::io::Error),
    #[error("error de serializacion JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("no se encontro la plantilla: {0}")]
    TemplateNotFound(String),
    #[error("Typst fallo al compilar:\n{0}")]
    Compile(String),
    #[error("no se encontro el binario de Typst")]
    TypstNotFound,
}

type Result<T> = std::result::Result<T, PdfError>;

// --- Documento que consume la plantilla Typst (build/data.json) ---

#[derive(Serialize)]
struct DataDoc {
    workspace: WorkspaceData,
    project: ProjectData,
    findings: Vec<FindingData>,
    severity_counts: SeverityCounts,
}

#[derive(Serialize)]
struct WorkspaceData {
    name: String,
    branding: Branding,
    watermark: Watermark,
}

#[derive(Serialize)]
struct ProjectData {
    name: String,
    client: String,
    start_date: String,
    end_date: String,
    scope: Vec<String>,
    team: Vec<TeamMember>,
    sections: Vec<SectionData>,
}

#[derive(Serialize)]
struct SectionData {
    key: String,
    title: String,
    /// Cuerpo ya convertido a markup de Typst.
    body: String,
}

#[derive(Serialize)]
struct FindingData {
    id: String,
    title: String,
    severity: String,
    cvss: String,
    cvss_version: String,
    cvss_vector: String,
    cwe: String,
    status: String,
    affected: Vec<String>,
    /// Cuerpo ya convertido a markup de Typst.
    body: String,
}

#[derive(Serialize, Default)]
struct SeverityCounts {
    critical: u32,
    high: u32,
    medium: u32,
    low: u32,
    info: u32,
}

impl SeverityCounts {
    fn add(&mut self, severity: Severity) {
        match severity {
            Severity::Critical => self.critical += 1,
            Severity::High => self.high += 1,
            Severity::Medium => self.medium += 1,
            Severity::Low => self.low += 1,
            Severity::Info => self.info += 1,
        }
    }
}

fn severity_str(s: Severity) -> String {
    match s {
        Severity::Critical => "critical",
        Severity::High => "high",
        Severity::Medium => "medium",
        Severity::Low => "low",
        Severity::Info => "info",
    }
    .to_string()
}

fn version_str(v: crate::models::CvssVersion) -> String {
    match v {
        crate::models::CvssVersion::V31 => "3.1",
        crate::models::CvssVersion::V40 => "4.0",
    }
    .to_string()
}

fn status_str(s: crate::models::FindingStatus) -> String {
    serde_json::to_string(&s)
        .unwrap_or_default()
        .trim_matches('"')
        .to_string()
}

/// Construye el documento de datos del proyecto a partir de los archivos.
fn build_data(root: &Path, project_id: &str) -> Result<DataDoc> {
    let ws = workspace::read_workspace_meta(root)?;
    let project = workspace::read_project_meta(root, project_id)?;
    let findings = workspace::list_findings(root, project_id)?;

    let mut counts = SeverityCounts::default();
    let findings_data: Vec<FindingData> = findings
        .into_iter()
        .map(|f| {
            counts.add(f.meta.severity);
            FindingData {
                id: f.id,
                title: f.meta.title,
                severity: severity_str(f.meta.severity),
                cvss: f.meta.cvss,
                cvss_version: version_str(f.meta.cvss_version),
                cvss_vector: f.meta.cvss_vector,
                cwe: f.meta.cwe,
                status: status_str(f.meta.status),
                affected: f.meta.affected,
                body: markdown::to_typst(&f.body),
            }
        })
        .collect();

    // Solo se incluyen las secciones activadas.
    let sections = project
        .sections
        .into_iter()
        .filter(|s| s.enabled)
        .map(|s| SectionData {
            key: s.key,
            title: s.title,
            body: markdown::to_typst(&s.body),
        })
        .collect();

    Ok(DataDoc {
        workspace: WorkspaceData {
            name: ws.name,
            branding: ws.branding,
            watermark: ws.watermark,
        },
        project: ProjectData {
            name: project.name,
            client: project.client,
            start_date: project.start_date,
            end_date: project.end_date,
            scope: project.scope,
            team: project.team,
            sections,
        },
        findings: findings_data,
        severity_counts: counts,
    })
}

/// Resuelve la plantilla .typ activa: primero la libreria del usuario, luego
/// las plantillas base empaquetadas con la app.
fn resolve_template(root: &Path, templates_dir: &Path, name: &str) -> Result<PathBuf> {
    // Defensa contra traversal: la plantilla activa viene de workspace.yaml,
    // que podria ser de un tercero. Solo se aceptan nombres simples.
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(PdfError::TemplateNotFound(name.to_string()));
    }
    let user = root.join("library/templates").join(format!("{name}.typ"));
    if user.exists() {
        return Ok(user);
    }
    let builtin = templates_dir.join(format!("{name}.typ"));
    if builtin.exists() {
        return Ok(builtin);
    }
    Err(PdfError::TemplateNotFound(name.to_string()))
}

/// Resuelve el binario de Typst: variable de entorno, sidecar junto al
/// ejecutable, o `typst` en el PATH.
pub fn resolve_typst() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("PUDU_TYPST_BIN") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in ["typst", "typst.exe"] {
                let p = dir.join(candidate);
                if p.exists() {
                    return Ok(p);
                }
            }
        }
    }
    // Fallback al PATH (resuelto por el SO al ejecutar).
    Ok(PathBuf::from("typst"))
}

/// Serializa data.json y copia la plantilla activa al directorio build.
/// Devuelve (build_dir, report.typ) listos para compilar.
fn prepare_build(
    root: &Path,
    project_id: &str,
    templates_dir: &Path,
) -> Result<(PathBuf, PathBuf)> {
    let data = build_data(root, project_id)?;
    let build_dir = root.join(project_id).join("build");
    std::fs::create_dir_all(&build_dir)?;

    let json = serde_json::to_string_pretty(&data)?;
    std::fs::write(build_dir.join("data.json"), json)?;

    let ws = workspace::read_workspace_meta(root)?;
    let template = resolve_template(root, templates_dir, &ws.active_template)?;
    let report_typ = build_dir.join("report.typ");
    std::fs::copy(&template, &report_typ)?;

    // Copiar los assets del proyecto junto a report.typ para que las imagenes
    // referenciadas como "assets/<uuid>.png" en markdown resuelvan en Typst.
    let src_assets = root.join(project_id).join("assets");
    if src_assets.is_dir() {
        let dst_assets = build_dir.join("assets");
        std::fs::create_dir_all(&dst_assets)?;
        for entry in std::fs::read_dir(&src_assets)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                std::fs::copy(entry.path(), dst_assets.join(entry.file_name()))?;
            }
        }
    }

    Ok((build_dir, report_typ))
}

/// Ejecuta `typst compile` mapeando el error de binario ausente.
fn run_typst(
    typst_bin: &Path,
    root: &Path,
    report_typ: &Path,
    out: &Path,
    ppi: Option<u32>,
) -> Result<()> {
    let mut cmd = Command::new(typst_bin);
    cmd.arg("compile").arg("--root").arg(root);
    if let Some(ppi) = ppi {
        cmd.arg("--format")
            .arg("png")
            .arg("--ppi")
            .arg(ppi.to_string());
    }
    let output = cmd.arg(report_typ).arg(out).output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            PdfError::TypstNotFound
        } else {
            PdfError::Io(e)
        }
    })?;
    if !output.status.success() {
        return Err(PdfError::Compile(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

/// Genera el PDF del proyecto y devuelve la ruta del archivo producido.
pub fn generate_pdf(
    root: &Path,
    project_id: &str,
    templates_dir: &Path,
    typst_bin: &Path,
) -> Result<PathBuf> {
    let (build_dir, report_typ) = prepare_build(root, project_id, templates_dir)?;
    let pdf_path = build_dir.join(format!("{project_id}.pdf"));
    run_typst(typst_bin, root, &report_typ, &pdf_path, None)?;
    Ok(pdf_path)
}

/// Renderiza el PDF a PNG por pagina y los devuelve como data URLs base64,
/// para mostrar la vista previa dentro de la app (sin escribir a disco final).
pub fn preview_pdf(
    root: &Path,
    project_id: &str,
    templates_dir: &Path,
    typst_bin: &Path,
) -> Result<Vec<String>> {
    use base64::Engine;

    let (build_dir, report_typ) = prepare_build(root, project_id, templates_dir)?;
    let preview_dir = build_dir.join("preview");
    std::fs::create_dir_all(&preview_dir)?;
    // Limpiar PNGs previos para no mezclar paginas viejas.
    if let Ok(entries) = std::fs::read_dir(&preview_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().is_some_and(|e| e == "png") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    // Typst sustituye {p} por el numero de pagina (1-based).
    let pattern = preview_dir.join("page-{0p}.png");
    run_typst(typst_bin, root, &report_typ, &pattern, Some(120))?;

    // Recolectar las paginas en orden.
    let mut pages: Vec<PathBuf> = std::fs::read_dir(&preview_dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "png"))
        .collect();
    pages.sort();

    let engine = base64::engine::general_purpose::STANDARD;
    let mut out = Vec::new();
    for page in pages {
        let bytes = std::fs::read(&page)?;
        out.push(format!("data:image/png;base64,{}", engine.encode(&bytes)));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_data_serializes() {
        let tmp = std::env::temp_dir().join(format!("pudu-pdf-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        workspace::create_workspace(&tmp, "WS").unwrap();
        let (pid, _) = workspace::create_project(&tmp, "Web", "ACME").unwrap();
        workspace::create_finding(&tmp, &pid, "SQLi").unwrap();

        let data = build_data(&tmp, &pid).unwrap();
        assert_eq!(data.project.client, "ACME");
        assert_eq!(data.findings.len(), 1);
        assert!(serde_json::to_string(&data).is_ok());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Devuelve true si hay un binario de Typst ejecutable disponible.
    fn typst_available(bin: &Path) -> bool {
        Command::new(bin)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn generate_pdf_end_to_end() {
        // Integracion del pipeline completo: archivos -> data.json -> Typst -> PDF.
        let templates = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("templates");
        let typst_bin = resolve_typst().unwrap();
        if !typst_available(&typst_bin) {
            eprintln!("Typst no disponible; se omite el test de integracion de PDF");
            return;
        }

        let tmp = std::env::temp_dir().join(format!("pudu-pdfgen-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        workspace::create_workspace(&tmp, "WS").unwrap();
        let (pid, _) = workspace::create_project(&tmp, "Pentest", "ACME").unwrap();

        let f = workspace::create_finding(&tmp, &pid, "SQL Injection en login").unwrap();
        let mut finding = f;
        finding.meta.severity = Severity::Critical;
        finding.meta.cvss = "9.8".into();
        finding.body =
            "## Descripcion\n\nEl parametro **user** es vulnerable.\n\n```sql\nSELECT 1\n```"
                .into();
        workspace::write_finding(&tmp, &pid, &finding).unwrap();

        for template in ["corporativo", "bug-bounty", "infra"] {
            let mut ws = workspace::read_workspace_meta(&tmp).unwrap();
            ws.active_template = template.to_string();
            workspace::write_workspace_meta(&tmp, &ws).unwrap();

            let pdf = generate_pdf(&tmp, &pid, &templates, &typst_bin)
                .unwrap_or_else(|e| panic!("fallo {template}: {e}"));
            let bytes = std::fs::metadata(&pdf).unwrap().len();
            assert!(bytes > 1000, "PDF de {template} sospechosamente pequeno");
        }

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
