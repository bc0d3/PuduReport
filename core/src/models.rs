//! Modelos de datos serializables compartidos con el frontend.
//!
//! Espejan los tipos de `src/lib/types.ts`. Cualquier cambio aqui debe
//! reflejarse alli. Los archivos en disco (.md/.yaml) son la fuente de verdad;
//! estos structs describen su forma serializada.

use serde::{Deserialize, Deserializer, Serialize};

/// Deserializa el campo `cwe` aceptando tanto el formato viejo (un string, ej
/// `cwe: CWE-89`) como el nuevo (una lista). Mantiene compatibilidad con los
/// hallazgos ya escritos en disco. Descarta entradas vacias.
fn de_cwe<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OneOrMany {
        One(String),
        Many(Vec<String>),
    }
    let value = OneOrMany::deserialize(deserializer)?;
    let list = match value {
        OneOrMany::One(s) => vec![s],
        OneOrMany::Many(items) => items,
    };
    Ok(list.into_iter().filter(|s| !s.trim().is_empty()).collect())
}

/// Severidad cualitativa derivada del puntaje CVSS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    #[default]
    Info,
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    /// Mapea un puntaje 0.0-10.0 a la banda de severidad estandar.
    pub fn from_score(score: f64) -> Self {
        if score <= 0.0 {
            Severity::Info
        } else if score < 4.0 {
            Severity::Low
        } else if score < 7.0 {
            Severity::Medium
        } else if score < 9.0 {
            Severity::High
        } else {
            Severity::Critical
        }
    }
}

/// Version del estandar CVSS usada en un hallazgo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum CvssVersion {
    #[default]
    #[serde(rename = "3.1")]
    V31,
    #[serde(rename = "4.0")]
    V40,
}

/// Estado de remediacion del hallazgo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum FindingStatus {
    #[default]
    Open,
    Fixed,
    Accepted,
    Wontfix,
}

/// Front-matter estructurado de un hallazgo.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FindingMeta {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub severity: Severity,
    #[serde(default)]
    pub cvss_version: CvssVersion,
    #[serde(default)]
    pub cvss: String,
    #[serde(default)]
    pub cvss_vector: String,
    /// Identificadores CWE del hallazgo (puede tener varios). Acepta el formato
    /// viejo de un solo string al leer archivos previos (ver `de_cwe`).
    #[serde(default, deserialize_with = "de_cwe")]
    pub cwe: Vec<String>,
    #[serde(default)]
    pub status: FindingStatus,
    #[serde(default)]
    pub affected: Vec<String>,
}

/// Hallazgo completo: front-matter + cuerpo markdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub meta: FindingMeta,
    pub body: String,
}

/// Seccion de prosa del reporte (resumen, alcance, metodologia, conclusiones).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSection {
    pub key: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    /// Si la seccion se incluye en el PDF. Permite activarla/desactivarla.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub name: String,
    pub role: String,
}

/// project.yaml
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMeta {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub client: String,
    /// Gerencia del cliente (opcional). Se muestra en la portada si no esta vacio.
    #[serde(default)]
    pub gerencia: String,
    /// Area del cliente (opcional). Se muestra en la portada si no esta vacio.
    #[serde(default)]
    pub area: String,
    /// Tipo de proyecto: define el formulario, el scaffold de secciones y la
    /// plantilla por defecto. "pentest" | "redteam" | "oscp" | "htb" |
    /// "ejecutivo" | "documento" | "retest".
    #[serde(default = "default_project_type")]
    pub project_type: String,
    /// OSID del candidato (solo tipos de examen). Va en la portada y el nombre
    /// del PDF.
    #[serde(default)]
    pub osid: String,
    /// Plantilla .typ a usar en vez de la del tipo. Vacio = la del tipo.
    #[serde(default)]
    pub template_override: String,
    #[serde(default)]
    pub start_date: String,
    #[serde(default)]
    pub end_date: String,
    #[serde(default)]
    pub scope: Vec<String>,
    #[serde(default)]
    pub team: Vec<TeamMember>,
    #[serde(default)]
    pub sections: Vec<ReportSection>,
    #[serde(default)]
    pub finding_order: Vec<String>,
}

/// Tipo de proyecto por defecto cuando el archivo no lo trae.
pub fn default_project_type() -> String {
    "pentest".to_string()
}

/// Plantilla .typ por defecto para cada tipo de proyecto. Pentest y red team
/// comparten diseno visual; el override por proyecto puede cambiarla.
pub fn template_for_type(project_type: &str) -> &'static str {
    match project_type {
        "oscp" => "oscp",
        "htb" => "htb",
        "ejecutivo" => "ejecutivo",
        "documento" => "documento-libre",
        "retest" => "retest",
        // pentest, redteam y cualquier desconocido caen al diseno de pentest.
        _ => "pentest",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Watermark {
    pub enabled: bool,
    pub text: String,
    pub opacity: f64,
    /// Tamano de fuente en puntos. Editable; el texto nunca se parte.
    #[serde(default = "default_watermark_size")]
    pub size: f64,
}

fn default_watermark_size() -> f64 {
    64.0
}

impl Default for Watermark {
    fn default() -> Self {
        // Marca de agua activada por default segun README.dev.md.
        Watermark {
            enabled: true,
            text: "CONFIDENCIAL".to_string(),
            opacity: 0.08,
            size: default_watermark_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branding {
    #[serde(default)]
    pub logo_path: String,
    /// Imagen de fondo de portada (distinta del logo). Vacio = color de marca.
    #[serde(default)]
    pub cover_background: String,
    #[serde(default = "default_primary_color")]
    pub primary_color: String,
    #[serde(default = "default_cover_layout")]
    pub cover_layout: String,
    /// Opacidad de la capa oscura sobre la imagen de fondo (0.0 - 1.0).
    #[serde(default = "default_scrim")]
    pub cover_scrim: f64,
    /// Si cada hallazgo arranca en su propia pagina en el PDF.
    #[serde(default = "default_true")]
    pub findings_page_break: bool,
}

fn default_scrim() -> f64 {
    0.5
}

fn default_primary_color() -> String {
    // Acento del sistema de diseno (ver DESING.md).
    "#1f6fb2".to_string()
}

fn default_cover_layout() -> String {
    "centered".to_string()
}

impl Default for Branding {
    fn default() -> Self {
        Branding {
            logo_path: String::new(),
            cover_background: String::new(),
            primary_color: default_primary_color(),
            cover_layout: default_cover_layout(),
            cover_scrim: default_scrim(),
            findings_page_break: true,
        }
    }
}

/// workspace.yaml
///
/// El workspace solo guarda identidad visual compartida (branding, watermark).
/// La plantilla y el tipo de reporte viven en cada proyecto (ProjectMeta).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspaceMeta {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub branding: Branding,
    #[serde(default)]
    pub watermark: Watermark,
}

/// Resumen liviano de un proyecto para listados.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub client: String,
    pub project_type: String,
    pub end_date: String,
    pub finding_count: usize,
}

/// Hallazgo reutilizable de la libreria.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingTemplate {
    pub id: String,
    pub meta: FindingMeta,
    pub body: String,
}

/// Snippet de texto reutilizable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub body: String,
}

/// Plantilla de PDF (.typ) disponible.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfTemplate {
    /// Nombre de archivo sin extension (id).
    pub name: String,
    pub builtin: bool,
    /// Titulo legible (de la metadata; cae al nombre si falta).
    #[serde(default)]
    pub title: String,
    /// Descripcion corta.
    #[serde(default)]
    pub description: String,
    /// Tags para filtrar (red-team, perimetral, web, oscp, htb...).
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Resultado del calculo CVSS.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvssResult {
    pub score: f64,
    pub severity: Severity,
    pub vector: String,
}

/// Conteo de hallazgos por severidad (para el dashboard de Inicio).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SeverityCounts {
    pub critical: usize,
    pub high: usize,
    pub medium: usize,
    pub low: usize,
    pub info: usize,
}

impl SeverityCounts {
    /// Incrementa el contador de la severidad dada.
    pub fn add(&mut self, severity: Severity) {
        match severity {
            Severity::Critical => self.critical += 1,
            Severity::High => self.high += 1,
            Severity::Medium => self.medium += 1,
            Severity::Low => self.low += 1,
            Severity::Info => self.info += 1,
        }
    }
}

/// Estadisticas de un proyecto para el dashboard.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectStats {
    pub id: String,
    pub name: String,
    pub client: String,
    pub project_type: String,
    pub total: usize,
    pub severity: SeverityCounts,
}

/// Resumen del workspace para el dashboard de Inicio.
#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceStats {
    pub total_projects: usize,
    pub total_findings: usize,
    /// Hallazgos en estado "open" en todo el workspace.
    pub open_findings: usize,
    pub severity: SeverityCounts,
    pub projects: Vec<ProjectStats>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cwe_acepta_string_viejo_y_lista_nueva() {
        // Formato viejo: un solo string (hallazgos ya escritos en disco).
        let viejo: FindingMeta = serde_yaml::from_str("title: x\ncwe: CWE-89\n").unwrap();
        assert_eq!(viejo.cwe, vec!["CWE-89".to_string()]);

        // Formato nuevo: lista de CWE.
        let nuevo: FindingMeta =
            serde_yaml::from_str("title: x\ncwe:\n- CWE-89\n- CWE-200\n").unwrap();
        assert_eq!(nuevo.cwe, vec!["CWE-89".to_string(), "CWE-200".to_string()]);

        // Vacio o ausente: lista vacia (no un string vacio).
        let vacio: FindingMeta = serde_yaml::from_str("title: x\ncwe: ''\n").unwrap();
        assert!(vacio.cwe.is_empty());
        let ausente: FindingMeta = serde_yaml::from_str("title: x\n").unwrap();
        assert!(ausente.cwe.is_empty());
    }
}
