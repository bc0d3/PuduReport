// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

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

/// Estado del proyecto en el tablero Kanban (vista de Proyectos). El default
/// es `Done` (no `Todo`) a proposito: es lo que usa `#[serde(default)]` para
/// los `project.yaml` legados sin este campo, para no amontonar informes ya
/// entregados en "To Do". Los proyectos nuevos fijan `Todo` explicitamente
/// (ver `create_project`/`create_example_project`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Todo,
    Inprogress,
    #[default]
    Done,
    Assigned,
}

/// Registro de asignacion de cierre de un proyecto: quien se hizo cargo y
/// cuando. Se agrega uno por cada vez que la tarjeta entra a la columna
/// "Asignado/En cierre" (historial append-only, no se sobreescribe, para
/// llevar el balance de asignaciones).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAssignment {
    pub name: String,
    pub email: String,
    /// UTC ISO-8601, ej "2026-07-24T15:32:00Z". Generado en el backend (ver
    /// `workspace::now_utc_iso`), no en el frontend.
    pub assigned_at: String,
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
    /// Oculta campos puntuales del hallazgo en el PDF sin ocultarlo entero.
    /// Valores: "affected" y las claves de seccion del body ("descripcion",
    /// "impacto", "poc", "remediacion"; ver `src/lib/sections.ts` y
    /// `sections::strip_hidden_sections`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hidden_fields: Vec<String>,
    /// Marca el hallazgo como NUEVO detectado durante un retest. Solo relevante
    /// en reportes de familia retest; la plantilla los muestra aparte.
    #[serde(default, skip_serializing_if = "is_false")]
    pub new_in_retest: bool,
    /// Impacto para el negocio en un parrafo corto de texto plano (opcional,
    /// hasta `MAX_IMPACTO_NEGOCIO` caracteres). Lo usan la parte ejecutiva del
    /// PDF y las exportaciones; no reemplaza la seccion Impacto del cuerpo.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub impacto_negocio: String,
    /// Categoria de riesgo para el negocio (opcional, lista cerrada
    /// `CATEGORIAS_RIESGO`; "" = sin especificar). Agrupa los hallazgos en
    /// "Riesgos para el negocio".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub categoria_riesgo: String,
    /// Modulo o componente afectado (opcional, hasta `MAX_MODULO` caracteres).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub modulo: String,
    /// Clave de una causa raiz del proyecto (`ProjectMeta::causas_raiz`). ""
    /// = sin causa raiz. Una clave que no existe en el proyecto se descarta.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub causa_raiz: String,
}

/// Valores permitidos de `FindingMeta::categoria_riesgo` ("" = sin especificar).
pub const CATEGORIAS_RIESGO: [&str; 7] = [
    "",
    "fuga_datos",
    "fraude_economico",
    "interrupcion_servicio",
    "incumplimiento_regulatorio",
    "reputacional",
    "reconocimiento",
];

/// Etiqueta legible de una categoria de riesgo (PDF y CSV). "" si no aplica.
pub fn categoria_riesgo_label(slug: &str) -> &'static str {
    match slug {
        "fuga_datos" => "Fuga de datos personales",
        "fraude_economico" => "Fraude economico",
        "interrupcion_servicio" => "Interrupcion del servicio",
        "incumplimiento_regulatorio" => "Incumplimiento regulatorio",
        "reputacional" => "Reputacional",
        "reconocimiento" => "Reconocimiento y persistencia",
        _ => "",
    }
}

/// Largo maximo (en caracteres) de `FindingMeta::impacto_negocio`.
pub const MAX_IMPACTO_NEGOCIO: usize = 500;
/// Largo maximo (en caracteres) de `FindingMeta::modulo`.
pub const MAX_MODULO: usize = 120;
/// Largo maximo de los textos cortos de la parte ejecutiva (titulo de una
/// causa raiz, responsable de una accion).
pub const MAX_TEXTO_CORTO: usize = 120;
/// Largo maximo de los textos largos de la parte ejecutiva (descripcion de una
/// causa raiz, accion de remediacion).
pub const MAX_TEXTO_LARGO: usize = 1000;

/// Reemplaza los saltos de linea por espacios (texto de un solo parrafo) y
/// corta en `max` caracteres. No recorta espacios: se aplica al guardar
/// mientras el usuario escribe, y recortar le moveria el texto. Idempotente.
fn single_paragraph(value: &str, max: usize) -> String {
    value
        .chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .take(max)
        .collect()
}

/// Corta un texto en `max` caracteres (no en bytes, para no partir un
/// caracter multibyte).
fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// Texto de proyecto ya recortado: corta en `max` y vuelve a recortar el final,
/// asi un corte justo antes de un espacio no cambia en la siguiente lectura.
/// Idempotente.
fn trimmed_text(value: &str, max: usize, paragraph: bool) -> String {
    let value = value.trim();
    let cut = if paragraph {
        single_paragraph(value, max)
    } else {
        truncate_chars(value, max)
    };
    cut.trim_end().to_string()
}

impl FindingMeta {
    /// Deja los campos de negocio dentro de sus reglas: `categoria_riesgo` en la
    /// lista cerrada, `impacto_negocio` y `modulo` en un parrafo y con su largo
    /// maximo, y `causa_raiz` solo si es una de `root_cause_keys` (si no, "").
    /// Con `root_cause_keys = None` (proyecto ilegible) no toca `causa_raiz`.
    /// Idempotente.
    pub fn normalize_business_fields(&mut self, root_cause_keys: Option<&[&str]>) {
        self.categoria_riesgo = normalize_choice(&self.categoria_riesgo, &CATEGORIAS_RIESGO);
        self.impacto_negocio = single_paragraph(&self.impacto_negocio, MAX_IMPACTO_NEGOCIO);
        self.modulo = single_paragraph(&self.modulo, MAX_MODULO);
        if let Some(keys) = root_cause_keys {
            let key = self.causa_raiz.trim();
            self.causa_raiz = if keys.contains(&key) {
                key.to_string()
            } else {
                String::new()
            };
        }
    }
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
    /// text | pagebreak | root_causes | business_risks | findings_impact |
    /// remediation_plan.
    pub kind: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Configuracion libre del bloque (ej. {"key": "resumen"} para section,
    /// {"title":..,"body":..} para text). Mapa serializable y flexible.
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub config: serde_json::Map<String, serde_json::Value>,
}

/// Todos los kinds reconocidos.
pub const KNOWN_BLOCK_KINDS: [&str; 13] = [
    "cover",
    "info",
    "toc",
    "severity",
    "findings_index",
    "section",
    "findings",
    "text",
    "pagebreak",
    "root_causes",
    "business_risks",
    "findings_impact",
    "remediation_plan",
];

/// Kinds estructurales que solo deben aparecer una vez (singletons). `section`,
/// `text` y `pagebreak` pueden repetirse.
pub const SINGLETON_BLOCK_KINDS: [&str; 10] = [
    "cover",
    "info",
    "toc",
    "severity",
    "findings_index",
    "findings",
    "root_causes",
    "business_risks",
    "findings_impact",
    "remediation_plan",
];

/// Bloques de la parte ejecutiva (informe de ethical hacking), en su orden
/// canonico: causas raiz, riesgos para el negocio, tabla de hallazgos con su
/// impacto y plan de remediacion priorizado. Cada uno no renderiza nada si el
/// proyecto no tiene los datos que muestra.
pub const EXECUTIVE_BLOCK_KINDS: [&str; 4] = [
    "root_causes",
    "business_risks",
    "findings_impact",
    "remediation_plan",
];

/// Tipos de proyecto cuyas plantillas incluidas renderizan los bloques de la
/// parte ejecutiva (pentest y red team comparten `pentest.typ`).
pub fn supports_executive_blocks(project_type: &str) -> bool {
    matches!(project_type, "pentest" | "redteam" | "ejecutivo")
}

impl ReportBlock {
    /// Bloque simple sin config (cover, toc, info, severity, findings_index,
    /// findings, pagebreak y los bloques ejecutivos).
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
        // Incluye la parte ejecutiva (vacia si no hay datos) tras el resumen.
        "ejecutivo" => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.push(ReportBlock::simple("info"));
            blocks.push(ReportBlock::simple("severity"));
            blocks.extend(executive_blocks());
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
        // Pentest y red team: cuerpo completo con la parte ejecutiva antes de la
        // prosa y del detalle tecnico. Los bloques ejecutivos no renderizan nada
        // sin datos, asi un proyecto que no los usa genera el mismo PDF.
        "pentest" | "redteam" => {
            blocks.push(ReportBlock::simple("cover"));
            blocks.push(ReportBlock::simple("toc"));
            blocks.push(ReportBlock::simple("info"));
            blocks.push(ReportBlock::simple("severity"));
            blocks.push(ReportBlock::simple("findings_index"));
            blocks.extend(executive_blocks());
            blocks.extend(sections_blocks());
            blocks.push(ReportBlock::simple("findings"));
        }
        // htb y cualquier desconocido: cuerpo completo.
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

/// Bloques de la parte ejecutiva en su orden canonico.
fn executive_blocks() -> impl Iterator<Item = ReportBlock> {
    EXECUTIVE_BLOCK_KINDS.iter().map(|k| ReportBlock::simple(k))
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
    /// Ambiente evaluado (opcional): "" (sin especificar) | "qa" |
    /// "produccion". Metadata para integraciones; no se muestra en el PDF.
    /// Valores fuera de `AMBIENTES` se normalizan a "" (ver
    /// `normalize_classification`).
    #[serde(default)]
    pub ambiente: String,
    /// Exposicion del activo evaluado (opcional): "" (sin especificar) |
    /// "internet" | "interno". Metadata para integraciones (ej. SLA segun
    /// exposicion); no se muestra en el PDF. Valores fuera de `EXPOSICIONES` se
    /// normalizan a "".
    #[serde(default)]
    pub exposicion: String,
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
    pub project_status: ProjectStatus,
    #[serde(default)]
    pub assignment_history: Vec<ProjectAssignment>,
    #[serde(default)]
    pub sections: Vec<ReportSection>,
    /// Orden/estructura del cuerpo del PDF (lista de bloques). Vacio = usar el
    /// layout por defecto del tipo; no se escribe a disco mientras este vacio.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layout: Vec<ReportBlock>,
    #[serde(default)]
    pub finding_order: Vec<String>,
    /// Causas raiz del proyecto (parte ejecutiva del informe). Cada hallazgo
    /// puede apuntar a una por su `clave` (`FindingMeta::causa_raiz`). No se
    /// escribe a disco mientras este vacio.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub causas_raiz: Vec<CausaRaiz>,
    /// Plan de remediacion priorizado (parte ejecutiva del informe). No se
    /// escribe a disco mientras este vacio.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plan_remediacion: Vec<AccionRemediacion>,
}

/// Causa raiz comun a varios hallazgos (ej. "Validacion de entradas solo en
/// el cliente"). La `clave` es un slug estable que referencian los hallazgos.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct CausaRaiz {
    /// Slug estable (minusculas, digitos y guiones). Se genera al crearla y no
    /// cambia al editar el titulo, para no romper las referencias.
    #[serde(default)]
    pub clave: String,
    #[serde(default)]
    pub titulo: String,
    #[serde(default)]
    pub descripcion: String,
}

/// Accion del plan de remediacion priorizado.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct AccionRemediacion {
    /// Lista cerrada `PRIORIDADES_REMEDIACION` ("" = sin especificar).
    #[serde(default)]
    pub prioridad: String,
    /// Que hay que hacer, en imperativo.
    #[serde(default)]
    pub accion: String,
    /// Ids de los hallazgos que cierra esta accion. Los ids que no existen en
    /// el proyecto se descartan al leer y al guardar.
    #[serde(default)]
    pub hallazgos: Vec<String>,
    /// Area o persona responsable (texto libre corto, opcional).
    #[serde(default)]
    pub responsable: String,
}

/// Valores permitidos de `AccionRemediacion::prioridad`, en orden de urgencia
/// ("" = sin especificar, va al final).
pub const PRIORIDADES_REMEDIACION: [&str; 5] = ["", "inmediata", "corto", "mediano", "cierre"];

/// Etiqueta legible de una prioridad de remediacion. "" si no aplica.
pub fn prioridad_label(slug: &str) -> &'static str {
    match slug {
        "inmediata" => "Inmediata",
        "corto" => "Corto plazo",
        "mediano" => "Mediano plazo",
        "cierre" => "Cierre",
        _ => "",
    }
}

/// Orden de urgencia de una prioridad (menor = mas urgente). Sin especificar
/// va al final.
pub fn prioridad_rank(slug: &str) -> usize {
    match slug {
        "inmediata" => 0,
        "corto" => 1,
        "mediano" => 2,
        "cierre" => 3,
        _ => 4,
    }
}

/// Slug para la clave de una causa raiz: minusculas ASCII, digitos y guiones
/// simples, sin guiones en los extremos y hasta 64 caracteres. Las vocales
/// acentuadas y la enie se transliteran; el resto de los simbolos separa.
pub fn slug_key(value: &str) -> String {
    let mut out = String::new();
    for c in value.trim().chars().flat_map(char::to_lowercase) {
        let c = match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            other => other,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let mut out: String = out.chars().take(64).collect();
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// Valores permitidos de `ProjectMeta::ambiente` ("" = sin especificar).
pub const AMBIENTES: [&str; 3] = ["", "qa", "produccion"];

/// Valores permitidos de `ProjectMeta::exposicion` ("" = sin especificar).
pub const EXPOSICIONES: [&str; 3] = ["", "internet", "interno"];

/// Normaliza un valor de clasificacion contra su lista cerrada: recorta
/// espacios y pasa a minusculas; si no esta en `allowed`, devuelve "". Nunca
/// acepta texto libre.
fn normalize_choice(value: &str, allowed: &[&str]) -> String {
    let v = value.trim().to_ascii_lowercase();
    if allowed.contains(&v.as_str()) {
        v
    } else {
        String::new()
    }
}

impl ProjectMeta {
    /// Deja `ambiente` y `exposicion` dentro de sus valores permitidos
    /// (`AMBIENTES` / `EXPOSICIONES`); cualquier otro valor queda en "" (sin
    /// especificar). Idempotente. Se aplica al leer y al guardar desde la UI,
    /// asi un project.yaml editado a mano no propaga texto libre.
    pub fn normalize_classification(&mut self) {
        self.ambiente = normalize_choice(&self.ambiente, &AMBIENTES);
        self.exposicion = normalize_choice(&self.exposicion, &EXPOSICIONES);
    }

    /// Sanea la parte ejecutiva del proyecto. Idempotente. Se aplica al leer y
    /// al guardar, asi un project.yaml editado a mano no propaga datos
    /// invalidos:
    /// - Causas raiz: la clave queda como slug valido y unico (si falta, se
    ///   deriva del titulo o se numera); titulo y descripcion se recortan a su
    ///   largo maximo.
    /// - Plan de remediacion: `prioridad` dentro de `PRIORIDADES_REMEDIACION`
    ///   (si no, ""), `hallazgos` solo con ids de `finding_ids` y sin
    ///   repetidos, y textos acotados a su largo maximo.
    pub fn normalize_executive(&mut self, finding_ids: &[String]) {
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for (i, causa) in self.causas_raiz.iter_mut().enumerate() {
            let mut base = slug_key(&causa.clave);
            if base.is_empty() {
                base = slug_key(&causa.titulo);
            }
            if base.is_empty() {
                base = format!("causa-{}", i + 1);
            }
            let mut clave = base.clone();
            let mut n = 2;
            while seen.contains(&clave) {
                clave = format!("{base}-{n}");
                n += 1;
            }
            seen.insert(clave.clone());
            causa.clave = clave;
            causa.titulo = trimmed_text(&causa.titulo, MAX_TEXTO_CORTO, true);
            causa.descripcion = trimmed_text(&causa.descripcion, MAX_TEXTO_LARGO, false);
        }

        for accion in &mut self.plan_remediacion {
            accion.prioridad = normalize_choice(&accion.prioridad, &PRIORIDADES_REMEDIACION);
            accion.accion = trimmed_text(&accion.accion, MAX_TEXTO_LARGO, false);
            accion.responsable = trimmed_text(&accion.responsable, MAX_TEXTO_CORTO, true);
            let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
            accion
                .hallazgos
                .retain(|id| finding_ids.contains(id) && seen_ids.insert(id.clone()));
        }
    }

    /// Claves de las causas raiz definidas (para validar
    /// `FindingMeta::causa_raiz`).
    pub fn root_cause_keys(&self) -> Vec<&str> {
        self.causas_raiz.iter().map(|c| c.clave.as_str()).collect()
    }

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

        // 4. Proyectos previos a la parte ejecutiva: agregar los bloques que
        //    falten (solo en los tipos cuya plantilla los renderiza). No cambian
        //    el PDF mientras no haya datos, y asi el usuario puede activarlos,
        //    ocultarlos o moverlos sin recrear el layout.
        if supports_executive_blocks(&self.project_type) {
            let missing: Vec<ReportBlock> = EXECUTIVE_BLOCK_KINDS
                .iter()
                .filter(|k| !self.layout.iter().any(|b| b.kind == **k))
                .map(|k| ReportBlock::simple(k))
                .collect();
            if !missing.is_empty() {
                let pos = executive_insert_position(&self.layout);
                for (i, blk) in missing.into_iter().enumerate() {
                    self.layout.insert(pos + i, blk);
                }
            }
        }
    }
}

/// Donde insertar los bloques ejecutivos que falten: despues del ultimo
/// bloque ejecutivo presente; si no hay, despues del resumen (severity /
/// findings_index); si tampoco, antes de la primera seccion o del detalle de
/// hallazgos; y si no, al final.
fn executive_insert_position(layout: &[ReportBlock]) -> usize {
    let after_last = |kinds: &[&str]| {
        layout
            .iter()
            .rposition(|b| kinds.contains(&b.kind.as_str()))
            .map(|i| i + 1)
    };
    after_last(&EXECUTIVE_BLOCK_KINDS)
        .or_else(|| after_last(&["severity", "findings_index"]))
        .or_else(|| {
            layout
                .iter()
                .position(|b| b.kind == "section" || b.kind == "findings")
        })
        .unwrap_or(layout.len())
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
    /// Orden de las tarjetas del tablero Kanban de Proyectos (ids), definido
    /// arrastrando. Los proyectos que no aparecen aca van al final de su
    /// columna, ordenados por nombre.
    #[serde(default)]
    pub project_order: Vec<String>,
    /// Destinos de exportacion a API externa (opt-in, editables). Vacio por
    /// default: sin destinos, la app no hace ninguna llamada de red.
    #[serde(default)]
    pub export_targets: Vec<ExportTarget>,
}

/// Destino de exportacion a una API externa (opt-in, configurable y editable
/// por el usuario, por workspace).
///
/// Rompe conscientemente el default "nada sale del equipo": solo envia lo que
/// el usuario configura y confirma. Por eso el `token` NO se guarda aca
/// (workspace.yaml es git-friendly y versionable): vive en el keychain del SO,
/// referenciado por `name`. `fields` es la lista fija de campos de metadata que
/// se envian en cada exportacion, para que la API receptora reciba siempre el
/// mismo esquema (util para KPIs). El cuerpo/PoC de los hallazgos nunca se
/// incluye por este canal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTarget {
    /// Nombre unico del destino (identifica tambien la entrada en el keychain).
    pub name: String,
    /// URL del endpoint (se exige https:// al enviar).
    pub url: String,
    /// Campos de metadata a incluir por hallazgo (esquema estable).
    #[serde(default)]
    pub fields: Vec<String>,
    /// Incluir el bloque de conteos por severidad (summary) en el payload.
    #[serde(default)]
    pub include_summary: bool,
    /// Datos extra del proyecto a incluir en `project` (opt-in): "environment"
    /// (desde `ambiente`) y "exposure" (desde `exposicion`). Vacio por
    /// default, asi los destinos existentes reciben el mismo payload de
    /// siempre (un receptor podria rechazar claves que no conoce). Las claves
    /// desconocidas se ignoran.
    #[serde(default)]
    pub project_fields: Vec<String>,
}

/// Resumen liviano de un proyecto para listados.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub client: String,
    pub project_type: String,
    pub start_date: String,
    pub end_date: String,
    pub finding_count: usize,
    pub project_status: ProjectStatus,
    #[serde(default)]
    pub assignment_history: Vec<ProjectAssignment>,
}

/// Hallazgo reutilizable de la libreria.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingTemplate {
    pub id: String,
    pub meta: FindingMeta,
    pub body: String,
    /// Empaquetada con la app (solo lectura) vs guardada por el usuario en el
    /// workspace. Se calcula al listar, no se persiste en el .md.
    #[serde(default)]
    pub builtin: bool,
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
    /// La escribio/edito una IA via MCP (`save_pdf_template`), sin revision
    /// humana todavia. Solo aplica a plantillas de la libreria del usuario; las
    /// incluidas nunca lo tienen. La UI la resalta; no cambia como se aplica.
    #[serde(default, skip_serializing_if = "is_false")]
    pub ai_generated: bool,
}

/// Metadata sidecar de una plantilla (`<name>.meta.yaml`), solo en la
/// libreria del usuario. Las plantillas incluidas no tienen este archivo.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TemplateMeta {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Tags para filtrar y derivar la familia de render (ver
    /// `derive_family_from_tags` en `src-tauri`).
    #[serde(default)]
    pub tags: Vec<String>,
    /// Ver `PdfTemplate::ai_generated`.
    #[serde(default, skip_serializing_if = "is_false")]
    pub ai_generated: bool,
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
                "root_causes",
                "business_risks",
                "findings_impact",
                "remediation_plan",
                s,
                a,
                "findings"
            ]
        );
        // redteam comparte el cuerpo completo de pentest (misma plantilla).
        assert_eq!(
            layout_kinds(&default_layout("redteam", &secs)),
            layout_kinds(&default_layout("pentest", &secs))
        );
        // htb conserva el cuerpo completo sin la parte ejecutiva.
        assert_eq!(
            layout_kinds(&default_layout("htb", &secs)),
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
            layout_kinds(&default_layout("ejecutivo", &secs)),
            vec![
                "cover",
                "toc",
                "info",
                "severity",
                "root_causes",
                "business_risks",
                "findings_impact",
                "remediation_plan",
                s,
                a
            ]
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
        // Sin project_type el tipo es pentest: tambien se agregan los bloques
        // ejecutivos que faltan, antes de la primera seccion.
        assert_eq!(
            layout_kinds(&p.layout),
            vec![
                "toc",
                "text",
                "text",
                "root_causes",
                "business_risks",
                "findings_impact",
                "remediation_plan",
                "section:resumen",
                "section:metodologia",
                "findings"
            ]
        );
    }

    #[test]
    fn reconcile_layout_agrega_bloques_ejecutivos_a_layouts_previos() {
        // Layout guardado antes de la parte ejecutiva: se agregan despues del
        // resumen, sin tocar el resto ni el estado de los demas bloques.
        let mut p: ProjectMeta = serde_yaml::from_str(
            "project_type: pentest\nsections:\n- {key: resumen, title: R}\nlayout:\n- {kind: cover}\n- {kind: severity, enabled: false}\n- {kind: findings_index}\n- {kind: section, config: {key: resumen}}\n- {kind: findings}\n",
        )
        .unwrap();
        p.reconcile_layout();
        assert_eq!(
            layout_kinds(&p.layout),
            vec![
                "cover",
                "severity",
                "findings_index",
                "root_causes",
                "business_risks",
                "findings_impact",
                "remediation_plan",
                "section:resumen",
                "findings"
            ]
        );
        assert!(!p.layout[1].enabled);
        // Idempotente, y un bloque ejecutivo ya presente (oculto o movido) se
        // respeta: solo se agregan los que faltan, despues del ultimo presente.
        let antes = p.layout.clone();
        p.reconcile_layout();
        assert_eq!(p.layout, antes);

        let mut p: ProjectMeta = serde_yaml::from_str(
            "project_type: redteam\nlayout:\n- {kind: cover}\n- {kind: remediation_plan, enabled: false}\n- {kind: findings}\n- {kind: root_causes}\n",
        )
        .unwrap();
        p.reconcile_layout();
        assert_eq!(
            layout_kinds(&p.layout),
            vec![
                "cover",
                "remediation_plan",
                "findings",
                "root_causes",
                "business_risks",
                "findings_impact"
            ]
        );
        assert!(!p.layout[1].enabled);

        // Tipos cuya plantilla no los renderiza: no se agregan.
        for project_type in ["htb", "oscp", "retest", "documento", "cti"] {
            let mut p: ProjectMeta = serde_yaml::from_str(&format!(
                "project_type: {project_type}\nlayout:\n- {{kind: cover}}\n- {{kind: findings}}\n"
            ))
            .unwrap();
            p.reconcile_layout();
            assert_eq!(layout_kinds(&p.layout), vec!["cover", "findings"]);
        }
    }

    #[test]
    fn finding_viejo_sin_campos_de_negocio_se_lee_y_no_los_escribe() {
        // Front matter previo a la parte ejecutiva: backward-compat.
        let f: FindingMeta =
            serde_yaml::from_str("title: x\nseverity: high\nstatus: open\n").unwrap();
        assert_eq!(f.impacto_negocio, "");
        assert_eq!(f.categoria_riesgo, "");
        assert_eq!(f.modulo, "");
        assert_eq!(f.causa_raiz, "");
        // Vacios no ensucian el front matter.
        let yaml = serde_yaml::to_string(&f).unwrap();
        for key in [
            "impacto_negocio",
            "categoria_riesgo",
            "modulo",
            "causa_raiz",
        ] {
            assert!(!yaml.contains(key), "no deberia escribir {key}");
        }
        // Con valores, ida y vuelta sin perdida.
        let f = FindingMeta {
            impacto_negocio: "Fuga de la base de clientes.".into(),
            categoria_riesgo: "fuga_datos".into(),
            modulo: "Login".into(),
            causa_raiz: "validacion".into(),
            ..Default::default()
        };
        let back: FindingMeta = serde_yaml::from_str(&serde_yaml::to_string(&f).unwrap()).unwrap();
        assert_eq!(back.impacto_negocio, f.impacto_negocio);
        assert_eq!(back.categoria_riesgo, f.categoria_riesgo);
        assert_eq!(back.modulo, f.modulo);
        assert_eq!(back.causa_raiz, f.causa_raiz);
    }

    #[test]
    fn normalize_business_fields_aplica_las_reglas() {
        let mut f = FindingMeta {
            categoria_riesgo: " Fuga_Datos ".into(),
            impacto_negocio: format!("Linea uno\nlinea dos\r\n{}", "x".repeat(600)),
            modulo: "m".repeat(200),
            causa_raiz: " validacion ".into(),
            ..Default::default()
        };
        f.normalize_business_fields(Some(&["validacion", "acceso"]));
        assert_eq!(f.categoria_riesgo, "fuga_datos");
        assert!(f.impacto_negocio.starts_with("Linea uno linea dos  x"));
        assert!(!f.impacto_negocio.contains('\n'));
        assert_eq!(f.impacto_negocio.chars().count(), MAX_IMPACTO_NEGOCIO);
        assert_eq!(f.modulo.chars().count(), MAX_MODULO);
        assert_eq!(f.causa_raiz, "validacion");
        // Idempotente.
        let antes = f.clone();
        f.normalize_business_fields(Some(&["validacion", "acceso"]));
        assert_eq!(f.impacto_negocio, antes.impacto_negocio);
        assert_eq!(f.modulo, antes.modulo);

        // Valores fuera de la lista y causas inexistentes quedan en "".
        let mut f = FindingMeta {
            categoria_riesgo: "phishing".into(),
            causa_raiz: "borrada".into(),
            ..Default::default()
        };
        f.normalize_business_fields(Some(&["validacion"]));
        assert_eq!(f.categoria_riesgo, "");
        assert_eq!(f.causa_raiz, "");

        // Sin proyecto legible no se pierde la causa raiz.
        let mut f = FindingMeta {
            causa_raiz: "validacion".into(),
            ..Default::default()
        };
        f.normalize_business_fields(None);
        assert_eq!(f.causa_raiz, "validacion");

        // Todas las categorias permitidas tienen etiqueta y se conservan.
        for c in CATEGORIAS_RIESGO {
            let mut f = FindingMeta {
                categoria_riesgo: c.to_string(),
                ..Default::default()
            };
            f.normalize_business_fields(None);
            assert_eq!(f.categoria_riesgo, c);
            assert_eq!(categoria_riesgo_label(c).is_empty(), c.is_empty());
        }
        // Multibyte: se corta por caracteres, no por bytes.
        let mut f = FindingMeta {
            modulo: "ñ".repeat(300),
            ..Default::default()
        };
        f.normalize_business_fields(None);
        assert_eq!(f.modulo.chars().count(), MAX_MODULO);
    }

    #[test]
    fn project_yaml_viejo_sin_parte_ejecutiva() {
        let p: ProjectMeta = serde_yaml::from_str("name: Legado\nclient: ACME\n").unwrap();
        assert!(p.causas_raiz.is_empty());
        assert!(p.plan_remediacion.is_empty());
        // Vacias no se escriben a disco.
        let yaml = serde_yaml::to_string(&p).unwrap();
        assert!(!yaml.contains("causas_raiz"));
        assert!(!yaml.contains("plan_remediacion"));
    }

    #[test]
    fn normalize_executive_sanea_causas_y_plan() {
        let mut p: ProjectMeta = serde_yaml::from_str(
            "causas_raiz:\n- {clave: ' Validacion Entradas ', titulo: '  Validacion  '}\n- {clave: '', titulo: 'Control de acceso'}\n- {clave: '', titulo: ''}\n- {clave: validacion-entradas, titulo: Duplicada}\nplan_remediacion:\n- {prioridad: ' Inmediata ', accion: ' Parametrizar ', hallazgos: [001-a, 999-fantasma, 001-a, 002-b]}\n- {prioridad: urgente, accion: Otra}\n",
        )
        .unwrap();
        let ids = vec!["001-a".to_string(), "002-b".to_string()];
        p.normalize_executive(&ids);
        let claves: Vec<&str> = p.causas_raiz.iter().map(|c| c.clave.as_str()).collect();
        assert_eq!(
            claves,
            vec![
                "validacion-entradas",
                "control-de-acceso",
                "causa-3",
                "validacion-entradas-2"
            ]
        );
        assert_eq!(p.causas_raiz[0].titulo, "Validacion");
        assert_eq!(p.plan_remediacion[0].prioridad, "inmediata");
        assert_eq!(p.plan_remediacion[0].accion, "Parametrizar");
        assert_eq!(p.plan_remediacion[0].hallazgos, vec!["001-a", "002-b"]);
        // Prioridad fuera de la lista: sin especificar.
        assert_eq!(p.plan_remediacion[1].prioridad, "");
        // Idempotente.
        let antes = (p.causas_raiz.clone(), p.plan_remediacion.clone());
        p.normalize_executive(&ids);
        assert_eq!((p.causas_raiz.clone(), p.plan_remediacion.clone()), antes);

        for prioridad in PRIORIDADES_REMEDIACION {
            assert_eq!(prioridad_label(prioridad).is_empty(), prioridad.is_empty());
        }
        assert!(prioridad_rank("inmediata") < prioridad_rank("cierre"));
        assert!(prioridad_rank("cierre") < prioridad_rank(""));
    }

    #[test]
    fn normalize_executive_corte_antes_de_espacio_es_idempotente() {
        let titulo = format!("{} resto", "a".repeat(MAX_TEXTO_CORTO - 1));
        let accion = format!("{} resto", "b".repeat(MAX_TEXTO_LARGO - 1));
        let mut p = ProjectMeta {
            causas_raiz: vec![CausaRaiz {
                clave: "c".into(),
                titulo,
                descripcion: String::new(),
            }],
            plan_remediacion: vec![AccionRemediacion {
                prioridad: "cierre".into(),
                accion,
                hallazgos: vec![],
                responsable: String::new(),
            }],
            ..ProjectMeta::default()
        };
        p.normalize_executive(&[]);
        assert_eq!(p.causas_raiz[0].titulo, "a".repeat(MAX_TEXTO_CORTO - 1));
        assert_eq!(
            p.plan_remediacion[0].accion,
            "b".repeat(MAX_TEXTO_LARGO - 1)
        );
        let antes = (p.causas_raiz.clone(), p.plan_remediacion.clone());
        p.normalize_executive(&[]);
        assert_eq!((p.causas_raiz.clone(), p.plan_remediacion.clone()), antes);
    }

    #[test]
    fn slug_key_genera_claves_validas() {
        assert_eq!(slug_key("Validación de entradas"), "validacion-de-entradas");
        assert_eq!(slug_key("  --Año 2026!!  "), "ano-2026");
        assert_eq!(slug_key("***"), "");
        assert!(slug_key(&"a-".repeat(100)).len() <= 64);
        assert!(!slug_key(&"a-".repeat(100)).ends_with('-'));
    }

    #[test]
    fn project_yaml_viejo_sin_clasificacion_queda_sin_especificar() {
        // project.yaml previo a ambiente/exposicion: backward-compat.
        let p: ProjectMeta = serde_yaml::from_str("name: Legado\nclient: ACME\n").unwrap();
        assert_eq!(p.ambiente, "");
        assert_eq!(p.exposicion, "");
    }

    #[test]
    fn normalize_classification_acepta_solo_valores_permitidos() {
        let mut p = ProjectMeta {
            ambiente: " QA ".to_string(),
            exposicion: "internet".to_string(),
            ..Default::default()
        };
        p.normalize_classification();
        assert_eq!(p.ambiente, "qa");
        assert_eq!(p.exposicion, "internet");

        // Texto libre o valores desconocidos vuelven a "" (sin especificar).
        let mut p = ProjectMeta {
            ambiente: "staging".to_string(),
            exposicion: "dmz publica".to_string(),
            ..Default::default()
        };
        p.normalize_classification();
        assert_eq!(p.ambiente, "");
        assert_eq!(p.exposicion, "");

        // Todos los valores permitidos se conservan y es idempotente.
        for a in AMBIENTES {
            for e in EXPOSICIONES {
                let mut p = ProjectMeta {
                    ambiente: a.to_string(),
                    exposicion: e.to_string(),
                    ..Default::default()
                };
                p.normalize_classification();
                p.normalize_classification();
                assert_eq!(p.ambiente, a);
                assert_eq!(p.exposicion, e);
            }
        }
    }

    #[test]
    fn export_target_viejo_sin_project_fields_queda_vacio() {
        let t: ExportTarget =
            serde_yaml::from_str("name: hub\nurl: https://x.example\nfields: [titulo]\n").unwrap();
        assert!(t.project_fields.is_empty());
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
