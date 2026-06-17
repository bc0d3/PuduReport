//! Modelos de datos serializables compartidos con el frontend.
//!
//! Espejan los tipos de `src/lib/types.ts`. Cualquier cambio aqui debe
//! reflejarse alli. Los archivos en disco (.md/.yaml) son la fuente de verdad;
//! estos structs describen su forma serializada.

use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub cwe: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Watermark {
    pub enabled: bool,
    pub text: String,
    pub opacity: f64,
}

impl Default for Watermark {
    fn default() -> Self {
        // Marca de agua activada por default segun README.dev.md.
        Watermark {
            enabled: true,
            text: "CONFIDENCIAL".to_string(),
            opacity: 0.08,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branding {
    #[serde(default)]
    pub logo_path: String,
    #[serde(default = "default_primary_color")]
    pub primary_color: String,
    #[serde(default = "default_cover_layout")]
    pub cover_layout: String,
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
            primary_color: default_primary_color(),
            cover_layout: default_cover_layout(),
        }
    }
}

/// workspace.yaml
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMeta {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub branding: Branding,
    #[serde(default)]
    pub watermark: Watermark,
    #[serde(default = "default_template")]
    pub active_template: String,
}

fn default_template() -> String {
    "corporativo".to_string()
}

// Default manual: el derive daria active_template = "" (el atributo serde solo
// aplica al deserializar). Una plantilla activa valida es obligatoria.
impl Default for WorkspaceMeta {
    fn default() -> Self {
        WorkspaceMeta {
            name: String::new(),
            branding: Branding::default(),
            watermark: Watermark::default(),
            active_template: default_template(),
        }
    }
}

/// Resumen liviano de un proyecto para listados.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub client: String,
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
    pub name: String,
    pub builtin: bool,
}

/// Resultado del calculo CVSS.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvssResult {
    pub score: f64,
    pub severity: Severity,
    pub vector: String,
}
