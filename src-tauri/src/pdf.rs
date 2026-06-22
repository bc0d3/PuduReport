//! Pipeline de generacion de PDF.
//!
//! Separacion critica (README.dev.md): datos (`data.json`, generado) vs
//! presentacion (`.typ`, editable). El backend serializa el proyecto a
//! `build/data.json`, copia la plantilla activa a `build/report.typ` y compila
//! con Typst. Cualquier plantilla consume el mismo `data.json`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use pudureport_core::markdown;
use pudureport_core::models::{
    Branding, ProjectMeta, ReportBlock, Severity, TeamMember, Watermark,
};
use pudureport_core::workspace;

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
    /// Gerencia del cliente (opcional). La portada la muestra si no esta vacia.
    gerencia: String,
    /// Area del cliente (opcional). La portada la muestra si no esta vacia.
    area: String,
    /// Tipo de proyecto. Lo puede consumir la plantilla.
    project_type: String,
    /// OSID del candidato (tipos de examen). Va en la portada.
    osid: String,
    start_date: String,
    end_date: String,
    scope: Vec<String>,
    team: Vec<TeamMember>,
    sections: Vec<SectionData>,
    /// Orden/estructura del cuerpo: la plantilla recorre estos bloques y
    /// renderiza cada uno segun su kind. Se reconcilia (o se usa el default del
    /// tipo) en build_data.
    layout: Vec<ReportBlock>,
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

fn version_str(v: pudureport_core::models::CvssVersion) -> String {
    match v {
        pudureport_core::models::CvssVersion::V31 => "3.1",
        pudureport_core::models::CvssVersion::V40 => "4.0",
    }
    .to_string()
}

fn status_str(s: pudureport_core::models::FindingStatus) -> String {
    serde_json::to_string(&s)
        .unwrap_or_default()
        .trim_matches('"')
        .to_string()
}

/// Prepara el layout para data.json: convierte el cuerpo de los bloques de
/// texto libre (markdown) a markup de Typst, igual que las secciones. El resto
/// de los bloques pasa tal cual.
fn layout_for_data(layout: Vec<ReportBlock>) -> Vec<ReportBlock> {
    layout
        .into_iter()
        .map(|mut b| {
            if b.kind == "text" {
                let body = b
                    .config
                    .get("body")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                if let Some(body) = body {
                    let typ = markdown::to_typst(&body);
                    b.config
                        .insert("body".to_string(), serde_json::Value::String(typ));
                }
            }
            b
        })
        .collect()
}

/// Construye el documento de datos del proyecto a partir de los archivos.
fn build_data(root: &Path, project_id: &str) -> Result<DataDoc> {
    let ws = workspace::read_workspace_meta(root)?;
    let mut project = workspace::read_project_meta(root, project_id)?;
    // Layout efectivo del cuerpo: el guardado, o el default del tipo si esta
    // vacio. Deja la lista de bloques consistente con las secciones.
    project.reconcile_layout();
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
                // La plantilla muestra los CWE en un chip; se unen por coma.
                cwe: f.meta.cwe.join(", "),
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
            gerencia: project.gerencia,
            area: project.area,
            project_type: project.project_type,
            osid: project.osid,
            start_date: project.start_date,
            end_date: project.end_date,
            scope: project.scope,
            team: project.team,
            sections,
            layout: layout_for_data(project.layout),
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
    template_name: &str,
) -> Result<(PathBuf, PathBuf)> {
    let data = build_data(root, project_id)?;
    let build_dir = root.join(project_id).join("build");
    std::fs::create_dir_all(&build_dir)?;

    let json = serde_json::to_string_pretty(&data)?;
    std::fs::write(build_dir.join("data.json"), json)?;

    let template = resolve_template(root, templates_dir, template_name)?;
    let report_typ = build_dir.join("report.typ");
    std::fs::copy(&template, &report_typ)?;

    // Copiar el tema de color para bloques de codigo (lo usan las plantillas via
    // `set raw(theme: "code-dark.tmTheme")`); debe quedar junto a report.typ.
    let theme = templates_dir.join("code-dark.tmTheme");
    if theme.exists() {
        std::fs::copy(&theme, build_dir.join("code-dark.tmTheme"))?;
    }

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

/// Deja solo caracteres seguros para un nombre de archivo; cae a "XXXXX" vacio.
fn sanitize_osid(osid: &str) -> String {
    let s: String = osid
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if s.is_empty() {
        "XXXXX".to_string()
    } else {
        s
    }
}

/// Plantilla .typ efectiva del proyecto: el override si existe, si no la del tipo.
fn effective_template(project: &ProjectMeta) -> String {
    if project.template_override.is_empty() {
        pudureport_core::models::template_for_type(&project.project_type).to_string()
    } else {
        project.template_override.clone()
    }
}

/// Nombre del PDF generado. Los tipos de examen siguen la convencion de
/// submission (OSCP-OS-<OSID>-Exam-Report.pdf); el resto usa el id del proyecto.
fn report_filename(project: &ProjectMeta, project_id: &str) -> String {
    match project.project_type.as_str() {
        "oscp" => format!("OSCP-OS-{}-Exam-Report.pdf", sanitize_osid(&project.osid)),
        "htb" => format!("HTB-{}-Exam-Report.pdf", sanitize_osid(&project.osid)),
        _ => format!("{project_id}.pdf"),
    }
}

/// Genera el PDF del proyecto. Si `also_executive` es true y la plantilla no es
/// ya la ejecutiva, genera ademas un segundo PDF con la plantilla ejecutiva a
/// partir de los mismos datos. Devuelve las rutas producidas (principal primero).
pub fn generate_pdf(
    root: &Path,
    project_id: &str,
    templates_dir: &Path,
    typst_bin: &Path,
    also_executive: bool,
) -> Result<Vec<PathBuf>> {
    let project = workspace::read_project_meta(root, project_id)?;
    let template = effective_template(&project);
    let (build_dir, report_typ) = prepare_build(root, project_id, templates_dir, &template)?;
    let primary = build_dir.join(report_filename(&project, project_id));
    run_typst(typst_bin, root, &report_typ, &primary, None)?;
    let mut out = vec![primary];

    if also_executive && template != "ejecutivo" {
        // Reutiliza el data.json ya escrito; solo cambia la plantilla.
        let exec_src = resolve_template(root, templates_dir, "ejecutivo")?;
        let exec_typ = build_dir.join("report-ejecutivo.typ");
        std::fs::copy(&exec_src, &exec_typ)?;
        let exec_pdf = build_dir.join(format!("{project_id}-ejecutivo.pdf"));
        run_typst(typst_bin, root, &exec_typ, &exec_pdf, None)?;
        out.push(exec_pdf);
    }
    Ok(out)
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

    let project = workspace::read_project_meta(root, project_id)?;
    let template = effective_template(&project);
    let (build_dir, report_typ) = prepare_build(root, project_id, templates_dir, &template)?;
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
        let (pid, _) = workspace::create_project(&tmp, "Web", "ACME", "pentest").unwrap();
        workspace::create_finding(&tmp, &pid, "SQLi").unwrap();

        let data = build_data(&tmp, &pid).unwrap();
        assert_eq!(data.project.client, "ACME");
        assert_eq!(data.findings.len(), 1);
        assert!(serde_json::to_string(&data).is_ok());
        // El cuerpo se serializa como layout de bloques, arrancando por la portada.
        assert_eq!(
            data.project.layout.first().map(|b| b.kind.as_str()),
            Some("cover")
        );
        assert!(data.project.layout.iter().any(|b| b.kind == "findings"));

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
        let (pid, _) = workspace::create_project(&tmp, "Pentest", "ACME", "pentest").unwrap();

        let f = workspace::create_finding(&tmp, &pid, "SQL Injection en login").unwrap();
        let mut finding = f;
        finding.meta.severity = Severity::Critical;
        finding.meta.cvss = "9.8".into();
        finding.body =
            "## Descripcion\n\nEl parametro **user** es vulnerable.\n\n```sql\nSELECT 1\n```"
                .into();
        workspace::write_finding(&tmp, &pid, &finding).unwrap();

        // Fuentes custom en el branding: ejercita la rama de fuente elegida (no
        // solo el fallback) en todas las plantillas. Si la fuente no existe,
        // Typst cae al respaldo, pero la sintaxis del template se valida igual.
        let mut wsm = workspace::read_workspace_meta(&tmp).unwrap();
        wsm.branding.body_font = "Times New Roman".into();
        wsm.branding.mono_font = "Courier New".into();
        workspace::write_workspace_meta(&tmp, &wsm).unwrap();

        // Gerencia y area pobladas: ejercita la linea opcional de la portada
        // en todas las plantillas (la rama que las muestra).
        let mut p = workspace::read_project_meta(&tmp, &pid).unwrap();
        p.gerencia = "Gerencia de Tecnologia".into();
        p.area = "Seguridad de la Informacion".into();
        workspace::write_project_meta(&tmp, &pid, &p).unwrap();

        // Cada tipo de proyecto debe compilar con su plantilla derivada.
        for project_type in [
            "pentest",
            "redteam",
            "ejecutivo",
            "documento",
            "retest",
            "oscp",
            "htb",
        ] {
            let mut project = workspace::read_project_meta(&tmp, &pid).unwrap();
            project.project_type = project_type.to_string();
            workspace::write_project_meta(&tmp, &pid, &project).unwrap();

            let pdfs = generate_pdf(&tmp, &pid, &templates, &typst_bin, false)
                .unwrap_or_else(|e| panic!("fallo {project_type}: {e}"));
            let bytes = std::fs::metadata(&pdfs[0]).unwrap().len();
            assert!(
                bytes > 1000,
                "PDF de {project_type} sospechosamente pequeno"
            );
        }

        // Salida ejecutiva secundaria desde un proyecto de pentest.
        let mut project = workspace::read_project_meta(&tmp, &pid).unwrap();
        project.project_type = "pentest".to_string();
        workspace::write_project_meta(&tmp, &pid, &project).unwrap();
        let pdfs = generate_pdf(&tmp, &pid, &templates, &typst_bin, true).unwrap();
        assert_eq!(pdfs.len(), 2, "deberia generar principal + ejecutivo");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
