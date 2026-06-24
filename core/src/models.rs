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
    /// Oculta el hallazgo del PDF (no sale en tablas, indice ni detalle). Sigue
    /// en disco; es un flag de inclusion, independiente del estado.
    #[serde(default, skip_serializing_if = "is_false")]
    pub hidden: bool,
    /// Marca el hallazgo como NUEVO detectado durante un retest. Solo relevante
    /// en reportes de familia retest; la plantilla los muestra aparte.
    #[serde(default, skip_serializing_if = "is_false")]
    pub new_in_retest: bool,
}

/// Para `skip_serializing_if`: omite los bool en false (no ensucia el
/// front-matter de cada hallazgo con `hidden: false`).
fn is_false(b: &bool) -> bool {
    !*b
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

/// Bloque del cuerpo del reporte. El cuerpo es una lista ordenada de bloques
/// (`ProjectMeta::layout`) que la plantilla recorre y renderiza segun `kind`,
/// paginando solo. La portada (`cover`) tambien es un bloque. El contenido de
/// prosa vive en `ReportSection`; un bloque `section` lo referencia por
/// `config["key"]`. Un bloque `text` lleva su contenido en
/// `config["title"]`/`config["body"]`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReportBlock {
    /// cover | info | toc | severity | findings_index | section | findings |
    /// text | pagebreak.
    pub kind: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Configuracion libre del bloque (ej. {"key": "resumen"} para section,
    /// {"title":..,"body":..} para text). Mapa serializable y flexible.
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub config: serde_json::Map<String, serde_json::Value>,
}

/// Todos los kinds reconocidos.
pub const KNOWN_BLOCK_KINDS: [&str; 9] = [
    "cover",
    "info",
    "toc",
    "severity",
    "findings_index",
    "section",
    "findings",
    "text",
    "pagebreak",
];

/// Kinds estructurales que solo deben aparecer una vez (singletons). `section`,
/// `text` y `pagebreak` pueden repetirse.
pub const SINGLETON_BLOCK_KINDS: [&str; 6] = [
    "cover",
    "info",
    "toc",
    "severity",
    "findings_index",
    "findings",
];

impl ReportBlock {
    /// Bloque simple sin config (cover, toc, info, severity, findings_index,
    /// findings, pagebreak).
    pub fn simple(kind: &str) -> Self {
        ReportBlock {
            kind: kind.to_string(),
            enabled: true,
            config: serde_json::Map::new(),
        }
    }

    /// Bloque de seccion que referencia una `ReportSection` por su key.
    pub fn section(key: &str) -> Self {
        let mut config = serde_json::Map::new();
        config.insert(
            "key".to_string(),
            serde_json::Value::String(key.to_string()),
        );
        ReportBlock {
            kind: "section".to_string(),
            enabled: true,
            config,
        }
    }

    /// Key de la seccion referenciada (solo para `kind == "section"`).
    pub fn section_key(&self) -> Option<&str> {
        if self.kind == "section" {
            self.config.get("key").and_then(|v| v.as_str())
        } else {
            None
        }
    }
}

/// Layout por defecto del cuerpo segun el tipo de proyecto. Replica la
/// estructura historica de cada plantilla para que un proyecto sin layout
/// explicito genere un PDF identico al de antes de los bloques.
pub fn default_layout(project_type: &str, sections: &[ReportSection]) -> Vec<ReportBlock> {
    let sections_blocks = || sections.iter().map(|s| ReportBlock::section(&s.key));
    let mut blocks: Vec<ReportBlock> = Vec::new();
    match project_type {
        // Informe ejecutivo: portada, indice, info, resumen de severidades y
        // prosa. Sin detalle de hallazgos.
        "ejecutivo" => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.push(ReportBlock::simple("info"));
            blocks.push(ReportBlock::simple("severity"));
            blocks.extend(sections_blocks());
        }
        // Tipos de lienzo markdown (documento libre, CTI, DFIR y los defensivos):
        // portada, indice y prosa en markdown. Sin tabla de hallazgos ni severidad.
        "documento" | "cti" | "incidente" | "auditoria" | "cumplimiento" | "riesgos"
        | "hunting" => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.extend(sections_blocks());
        }
        // Retest: portada, indice, info, resumen por estado (severity), indice de
        // hallazgos verificados, prosa y detalle de verificacion (la plantilla
        // renderiza estos kinds a su modo).
        "retest" => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.push(ReportBlock::simple("info"));
            blocks.push(ReportBlock::simple("severity"));
            blocks.push(ReportBlock::simple("findings_index"));
            blocks.extend(sections_blocks());
            blocks.push(ReportBlock::simple("findings"));
        }
        // OSCP: portada, indice, resumen de severidades, prosa y hallazgos.
        "oscp" => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.push(ReportBlock::simple("severity"));
            blocks.extend(sections_blocks());
            blocks.push(ReportBlock::simple("findings"));
        }
        // pentest, redteam, htb y cualquier desconocido: cuerpo completo.
        _ => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.push(ReportBlock::simple("info"));
            blocks.push(ReportBlock::simple("severity"));
            blocks.push(ReportBlock::simple("findings_index"));
            blocks.extend(sections_blocks());
            blocks.push(ReportBlock::simple("findings"));
        }
    }
    blocks
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
    /// Orden/estructura del cuerpo del PDF (lista de bloques). Vacio = usar el
    /// layout por defecto del tipo; no se escribe a disco mientras este vacio.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layout: Vec<ReportBlock>,
    #[serde(default)]
    pub finding_order: Vec<String>,
}

impl ProjectMeta {
    /// Resuelve el layout efectivo del cuerpo, dejandolo consistente con las
    /// secciones. Idempotente. Si esta vacio usa `default_layout` del tipo; si
    /// no, sanea el layout guardado (descarta kinds desconocidos y secciones
    /// colgantes, de-dup de singletons y de secciones, y agrega un bloque por
    /// cada seccion sin bloque).
    pub fn reconcile_layout(&mut self) {
        if self.layout.is_empty() {
            self.layout = default_layout(&self.project_type, &self.sections);
            return;
        }

        let section_keys: std::collections::HashSet<&str> =
            self.sections.iter().map(|s| s.key.as_str()).collect();

        // 1. Descartar kinds desconocidos y secciones con key invalida/ausente.
        self.layout.retain(|b| {
            if b.kind == "section" {
                b.section_key().is_some_and(|k| section_keys.contains(k))
            } else {
                KNOWN_BLOCK_KINDS.contains(&b.kind.as_str())
            }
        });

        // 2. De-dup: singletons por kind y secciones por key (text/pagebreak se
        //    permiten repetidos).
        let mut seen_singleton: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut seen_section: std::collections::HashSet<String> = std::collections::HashSet::new();
        self.layout.retain(|b| {
            if b.kind == "section" {
                seen_section.insert(b.section_key().unwrap_or_default().to_string())
            } else if SINGLETON_BLOCK_KINDS.contains(&b.kind.as_str()) {
                seen_singleton.insert(b.kind.clone())
            } else {
                true
            }
        });

        // 3. Agregar un section-block por cada seccion sin bloque (antes del
        //    primer "findings", o al final si no hay).
        let (missing, pos) = {
            let present: std::collections::HashSet<&str> =
                self.layout.iter().filter_map(|b| b.section_key()).collect();
            let missing: Vec<ReportBlock> = self
                .sections
                .iter()
                .filter(|s| !present.contains(s.key.as_str()))
                .map(|s| ReportBlock::section(&s.key))
                .collect();
            let pos = self
                .layout
                .iter()
                .position(|b| b.kind == "findings")
                .unwrap_or(self.layout.len());
            (missing, pos)
        };
        for (i, blk) in missing.into_iter().enumerate() {
            self.layout.insert(pos + i, blk);
        }
    }
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
        "documento" | "auditoria" | "cumplimiento" | "riesgos" | "hunting" => "documento-libre",
        "cti" => "cti",
        "incidente" => "incidente",
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

/// Elemento posicionado libremente en la portada-lienzo (cover_layout =
/// "canvas"). Coordenadas normalizadas 0..1 sobre el AREA DE PAGINA COMPLETA
/// (A4, sin margenes): la portada-canvas se dibuja con margin: 0pt, asi el
/// editor (que muestra un rectangulo A4 completo) y el PDF coinciden 1:1.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverElement {
    /// "logo" | "title" | "client" | "subtitle" | "period" | "text" | "image".
    pub kind: String,
    /// Esquina superior-izquierda, normalizada 0..1 (x = fraccion del ancho).
    pub x: f64,
    pub y: f64,
    /// Ancho normalizado 0..1. Para texto, ancho del cuadro; para logo/image,
    /// ancho de la imagen.
    pub w: f64,
    /// Tamano de fuente en puntos (kinds de texto). 0 = default por kind.
    #[serde(default)]
    pub font_size: f64,
    /// "left" | "center" | "right" (texto).
    #[serde(default = "default_align")]
    pub align: String,
    /// Color del texto (hex). Vacio = color por kind.
    #[serde(default)]
    pub color: String,
    /// "normal" | "bold" (texto).
    #[serde(default = "default_weight")]
    pub weight: String,
    /// Contenido literal (solo kind "text").
    #[serde(default)]
    pub content: String,
    /// Ruta root-relative del asset (solo kind "image"): "/branding/<uuid>.png".
    #[serde(default)]
    pub src: String,
}

fn default_align() -> String {
    "left".to_string()
}

fn default_weight() -> String {
    "normal".to_string()
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
    /// Color del TITULO de la portada. Vacio = usa el color del layout (acento
    /// del reporte, o blanco en "Completa"). No cambia el fondo ni el cuerpo;
    /// permite un titulo de portada de otro color (ej. blanco sobre fondo oscuro).
    #[serde(default)]
    pub cover_color: String,
    #[serde(default = "default_cover_layout")]
    pub cover_layout: String,
    /// Opacidad de la capa oscura sobre la imagen de fondo (0.0 - 1.0).
    #[serde(default = "default_scrim")]
    pub cover_scrim: f64,
    /// Si cada hallazgo arranca en su propia pagina en el PDF.
    #[serde(default = "default_true")]
    pub findings_page_break: bool,
    /// Fuente del cuerpo del reporte. Vacio = usa la del sistema por defecto de
    /// la plantilla. Si se define, se usa primero con el sistema como respaldo.
    #[serde(default)]
    pub body_font: String,
    /// Fuente del codigo/vectores (monoespaciada). Vacio = la del sistema.
    #[serde(default)]
    pub mono_font: String,
    /// Mostrar el logo en la portada (aunque haya logo_path cargado).
    #[serde(default = "default_true")]
    pub cover_show_logo: bool,
    /// Subtitulo libre bajo el cliente en la portada. Vacio = no se muestra.
    #[serde(default)]
    pub cover_subtitle: String,
    /// Mostrar la linea de periodo (fechas) en la portada.
    #[serde(default = "default_true")]
    pub cover_show_period: bool,
    /// Mostrar la linea de gerencia/area (org-line) en la portada.
    #[serde(default = "default_true")]
    pub cover_show_org: bool,
    /// Mostrar la linea decorativa de acento en la portada.
    #[serde(default = "default_true")]
    pub cover_show_accent: bool,
    /// Elementos del lienzo libre de portada (cover_layout = "canvas"). Vacio =
    /// el branch canvas cae a un layout por defecto.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cover_elements: Vec<CoverElement>,
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
            cover_color: String::new(),
            cover_layout: default_cover_layout(),
            cover_scrim: default_scrim(),
            findings_page_break: true,
            body_font: String::new(),
            mono_font: String::new(),
            cover_show_logo: true,
            cover_subtitle: String::new(),
            cover_show_period: true,
            cover_show_org: true,
            cover_show_accent: true,
            cover_elements: Vec::new(),
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
    /// Familia de render: "findings" | "retest" | "narrative". Define el orden y
    /// el render. Explicita (del meta) o derivada de los tags como respaldo.
    #[serde(default)]
    pub family: String,
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

    #[test]
    fn branding_viejo_sin_campos_de_portada_usa_defaults() {
        // workspace.yaml previo a los toggles de elementos de portada: deben
        // arrancar visibles y el subtitulo vacio (retrocompatibilidad).
        let viejo: Branding = serde_yaml::from_str("primary_color: '#1f6fb2'\n").unwrap();
        assert!(viejo.cover_show_logo);
        assert!(viejo.cover_show_period);
        assert!(viejo.cover_show_org);
        assert!(viejo.cover_show_accent);
        assert!(viejo.cover_subtitle.is_empty());
        assert!(viejo.cover_elements.is_empty());
        assert!(viejo.cover_color.is_empty());
    }

    #[test]
    fn branding_canvas_deserializa_elementos() {
        let yaml = "cover_layout: canvas\ncover_elements:\n- {kind: title, x: 0.1, y: 0.2, w: 0.7}\n- {kind: text, x: 0.1, y: 0.5, w: 0.4, content: Hola, align: center}\n";
        let b: Branding = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(b.cover_layout, "canvas");
        assert_eq!(b.cover_elements.len(), 2);
        // Defaults por campo ausente.
        assert_eq!(b.cover_elements[0].align, "left");
        assert_eq!(b.cover_elements[0].weight, "normal");
        assert_eq!(b.cover_elements[0].font_size, 0.0);
        // Campos presentes.
        assert_eq!(b.cover_elements[1].kind, "text");
        assert_eq!(b.cover_elements[1].content, "Hola");
        assert_eq!(b.cover_elements[1].align, "center");
    }

    fn sec(key: &str) -> ReportSection {
        ReportSection {
            key: key.to_string(),
            title: key.to_string(),
            body: String::new(),
            enabled: true,
        }
    }

    /// Secuencia legible de kinds (las secciones como "section:<key>").
    fn layout_kinds(layout: &[ReportBlock]) -> Vec<String> {
        layout
            .iter()
            .map(|b| match b.section_key() {
                Some(k) => format!("section:{k}"),
                None => b.kind.clone(),
            })
            .collect()
    }

    #[test]
    fn default_layout_por_tipo() {
        let secs = vec![sec("resumen"), sec("alcance")];
        let s = "section:resumen";
        let a = "section:alcance";

        assert_eq!(
            layout_kinds(&default_layout("pentest", &secs)),
            vec![
                "cover",
                "toc",
                "info",
                "severity",
                "findings_index",
                s,
                a,
                "findings"
            ]
        );
        // redteam y htb comparten el cuerpo completo de pentest.
        assert_eq!(
            layout_kinds(&default_layout("redteam", &secs)),
            layout_kinds(&default_layout("pentest", &secs))
        );
        assert_eq!(
            layout_kinds(&default_layout("htb", &secs)),
            layout_kinds(&default_layout("pentest", &secs))
        );
        assert_eq!(
            layout_kinds(&default_layout("ejecutivo", &secs)),
            vec!["cover", "toc", "info", "severity", s, a]
        );
        assert_eq!(
            layout_kinds(&default_layout("documento", &secs)),
            vec!["cover", "toc", s, a]
        );
        assert_eq!(
            layout_kinds(&default_layout("retest", &secs)),
            vec![
                "cover",
                "toc",
                "info",
                "severity",
                "findings_index",
                s,
                a,
                "findings"
            ]
        );
        assert_eq!(
            layout_kinds(&default_layout("oscp", &secs)),
            vec!["cover", "toc", "severity", s, a, "findings"]
        );
    }

    #[test]
    fn reconcile_layout_vacio_usa_default_del_tipo() {
        // project.yaml previo a los bloques (sin layout): backward-compat.
        let mut p: ProjectMeta =
            serde_yaml::from_str("project_type: oscp\nsections:\n- {key: resumen, title: R}\n")
                .unwrap();
        assert!(p.layout.is_empty());
        p.reconcile_layout();
        assert_eq!(
            layout_kinds(&p.layout),
            vec!["cover", "toc", "severity", "section:resumen", "findings"]
        );
        // Idempotente.
        let antes = p.layout.clone();
        p.reconcile_layout();
        assert_eq!(p.layout, antes);
    }

    #[test]
    fn reconcile_layout_sanea_y_agrega_secciones() {
        // Layout custom: kind desconocido, seccion colgante, toc duplicado, y una
        // seccion (metodologia) sin bloque. text se permite repetido.
        let mut p: ProjectMeta = serde_yaml::from_str(
            "sections:\n- {key: resumen, title: R}\n- {key: metodologia, title: M}\nlayout:\n- {kind: toc}\n- {kind: toc}\n- {kind: bogus}\n- {kind: text}\n- {kind: text}\n- {kind: section, config: {key: ghost}}\n- {kind: section, config: {key: resumen}}\n- {kind: findings}\n",
        )
        .unwrap();
        p.reconcile_layout();
        assert_eq!(
            layout_kinds(&p.layout),
            vec![
                "toc",
                "text",
                "text",
                "section:resumen",
                "section:metodologia",
                "findings"
            ]
        );
    }

    #[test]
    fn report_block_config_roundtrip_yaml() {
        let b = ReportBlock::section("resumen");
        let yaml = serde_yaml::to_string(&b).unwrap();
        let back: ReportBlock = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.kind, "section");
        assert_eq!(back.section_key(), Some("resumen"));
        assert!(back.enabled);
        // Un bloque simple no serializa config vacio.
        let simple = serde_yaml::to_string(&ReportBlock::simple("toc")).unwrap();
        assert!(!simple.contains("config"));
    }
}
