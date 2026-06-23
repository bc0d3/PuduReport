//! I/O de archivos del workspace: parseo/serializacion de YAML + markdown.
//!
//! Regla de oro (README.dev.md): los archivos en disco son la fuente de verdad.
//! Toda escritura va al .md/.yaml; SQLite solo se reindexa desde aqui.
//!
//! Estructura en disco:
//! ```text
//! workspace/
//!   workspace.yaml
//!   .gitignore
//!   library/
//!     findings/*.md      hallazgos reutilizables con variables {{var}}
//!     snippets/*.md      snippets de texto
//!   <proyecto>/
//!     project.yaml
//!     findings/*.md
//!     assets/
//!     build/             (gitignored)
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use crate::models::{
    Finding, FindingMeta, FindingStatus, FindingTemplate, ProjectMeta, ProjectStats,
    ProjectSummary, SeverityCounts, Snippet, WorkspaceMeta, WorkspaceStats,
};

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceError {
    #[error("error de entrada/salida: {0}")]
    Io(#[from] std::io::Error),
    #[error("error de YAML: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("no se encontro front-matter YAML en {0}")]
    NoFrontMatter(String),
    #[error("el proyecto no existe: {0}")]
    ProjectNotFound(String),
    #[error("el hallazgo no existe: {0}")]
    FindingNotFound(String),
    #[error("nombre invalido: {0}")]
    InvalidName(String),
}

type Result<T> = std::result::Result<T, WorkspaceError>;

// ---------------------------------------------------------------------------
// Front-matter (YAML + cuerpo markdown)
// ---------------------------------------------------------------------------

/// Separa un documento "---\n<yaml>\n---\n<body>" en (yaml, body).
fn split_front_matter(content: &str, source: &str) -> Result<(String, String)> {
    let trimmed = content.strip_prefix('\u{feff}').unwrap_or(content);
    let trimmed = trimmed.trim_start();
    let rest = trimmed
        .strip_prefix("---")
        .ok_or_else(|| WorkspaceError::NoFrontMatter(source.to_string()))?;
    // El cierre del front-matter es una linea "---".
    let rest = rest.trim_start_matches(['\r', '\n']);
    let end = rest
        .find("\n---")
        .ok_or_else(|| WorkspaceError::NoFrontMatter(source.to_string()))?;
    let yaml = rest[..end].to_string();
    let after = &rest[end + 4..];
    let body = after.trim_start_matches(['\r', '\n']).to_string();
    Ok((yaml, body))
}

/// Serializa meta + cuerpo a un documento markdown con front-matter.
fn join_front_matter<T: serde::Serialize>(meta: &T, body: &str) -> Result<String> {
    let yaml = serde_yaml::to_string(meta)?;
    Ok(format!("---\n{}---\n\n{}\n", yaml, body.trim_end()))
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/// Convierte un titulo en un slug apto para nombre de archivo.
fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "hallazgo".to_string()
    } else {
        slug
    }
}

/// Valida que un identificador (proyecto/hallazgo/plantilla) sea un unico
/// segmento de ruta seguro, sin traversal. Defensa en profundidad: aunque hoy
/// los ids los genera el frontend con slugs, los comandos no deben confiar en
/// la entrada (workspaces de terceros, llamadas IPC arbitrarias).
fn validate_id(id: &str) -> Result<()> {
    let safe = !id.is_empty()
        && !id.contains('/')
        && !id.contains('\\')
        && !id.contains("..")
        && !id.starts_with('.')
        && Path::new(id).components().count() == 1;
    if safe {
        Ok(())
    } else {
        Err(WorkspaceError::InvalidName(id.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

fn workspace_yaml_path(root: &Path) -> PathBuf {
    root.join("workspace.yaml")
}

/// Crea la estructura inicial de un workspace nuevo.
pub fn create_workspace(root: &Path, name: &str) -> Result<WorkspaceMeta> {
    fs::create_dir_all(root)?;
    fs::create_dir_all(root.join("library/findings"))?;
    fs::create_dir_all(root.join("library/snippets"))?;

    let meta = WorkspaceMeta {
        name: name.to_string(),
        ..Default::default()
    };
    write_workspace_meta(root, &meta)?;
    write_gitignore(root)?;
    Ok(meta)
}

/// Lee workspace.yaml; si no existe, devuelve metadata por defecto.
pub fn read_workspace_meta(root: &Path) -> Result<WorkspaceMeta> {
    let path = workspace_yaml_path(root);
    if !path.exists() {
        return Ok(WorkspaceMeta::default());
    }
    let content = fs::read_to_string(path)?;
    Ok(serde_yaml::from_str(&content)?)
}

pub fn write_workspace_meta(root: &Path, meta: &WorkspaceMeta) -> Result<()> {
    let yaml = serde_yaml::to_string(meta)?;
    fs::write(workspace_yaml_path(root), yaml)?;
    Ok(())
}

/// Genera el .gitignore del workspace (ignora build/, incluye findings/+assets/).
fn write_gitignore(root: &Path) -> Result<()> {
    let content = "# Generado por PuduReport\nbuild/\n*.pdf\n.DS_Store\n";
    fs::write(root.join(".gitignore"), content)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

fn project_dir(root: &Path, id: &str) -> PathBuf {
    root.join(id)
}

fn project_yaml_path(root: &Path, id: &str) -> PathBuf {
    project_dir(root, id).join("project.yaml")
}

/// Lista los proyectos (carpetas con project.yaml) del workspace.
pub fn list_projects(root: &Path) -> Result<Vec<ProjectSummary>> {
    let mut out = Vec::new();
    if !root.exists() {
        return Ok(out);
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        if id == "library" || id.starts_with('.') {
            continue;
        }
        let yaml = project_yaml_path(root, &id);
        if !yaml.exists() {
            continue;
        }
        let meta = read_project_meta(root, &id)?;
        let finding_count = count_findings(root, &id)?;
        out.push(ProjectSummary {
            id,
            name: meta.name,
            client: meta.client,
            project_type: meta.project_type,
            end_date: meta.end_date,
            finding_count,
        });
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    Ok(out)
}

/// Agrega los conteos del workspace para el dashboard de Inicio: total de
/// proyectos/hallazgos, hallazgos abiertos y la distribucion por severidad
/// (global y por proyecto).
pub fn workspace_stats(root: &Path) -> Result<WorkspaceStats> {
    let summaries = list_projects(root)?;
    let mut total_findings = 0;
    let mut open_findings = 0;
    let mut severity = SeverityCounts::default();
    let mut projects = Vec::new();
    for s in &summaries {
        let findings = list_findings(root, &s.id)?;
        let mut psev = SeverityCounts::default();
        for f in &findings {
            psev.add(f.meta.severity);
            severity.add(f.meta.severity);
            if matches!(f.meta.status, FindingStatus::Open) {
                open_findings += 1;
            }
        }
        total_findings += findings.len();
        projects.push(ProjectStats {
            id: s.id.clone(),
            name: s.name.clone(),
            client: s.client.clone(),
            project_type: s.project_type.clone(),
            total: findings.len(),
            severity: psev,
        });
    }
    Ok(WorkspaceStats {
        total_projects: summaries.len(),
        total_findings,
        open_findings,
        severity,
        projects,
    })
}

/// Crea un proyecto nuevo del tipo indicado. El tipo define el scaffold de
/// secciones precargado (y mas adelante, en la UI, el formulario y la plantilla).
pub fn create_project(
    root: &Path,
    name: &str,
    client: &str,
    project_type: &str,
) -> Result<(String, ProjectMeta)> {
    let id = unique_dir(root, &slugify(name));
    let dir = project_dir(root, &id);
    fs::create_dir_all(dir.join("findings"))?;
    fs::create_dir_all(dir.join("assets"))?;
    fs::create_dir_all(dir.join("build"))?;

    let meta = ProjectMeta {
        name: name.to_string(),
        client: client.to_string(),
        project_type: project_type.to_string(),
        sections: sections_for_type(project_type),
        ..Default::default()
    };
    write_project_meta(root, &id, &meta)?;
    Ok((id, meta))
}

/// Borra un proyecto completo (su carpeta y todo su contenido) del workspace.
pub fn delete_project(root: &Path, project_id: &str) -> Result<()> {
    validate_id(project_id)?;
    let dir = project_dir(root, project_id);
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}

/// Crea un proyecto de ejemplo completo: secciones boilerplate + hallazgos
/// genericos pero entendibles, listo para generar un PDF de muestra.
pub fn create_example_project(root: &Path) -> Result<(String, ProjectMeta)> {
    use crate::models::TeamMember;

    let (id, _) = create_project(root, "Proyecto de ejemplo", "Cliente Demo S.A.", "pentest")?;

    let findings = example_findings();
    let order: Vec<String> = findings.iter().map(|f| f.id.clone()).collect();
    for finding in &findings {
        write_finding(root, &id, finding)?;
    }

    let meta = ProjectMeta {
        name: "Proyecto de ejemplo".to_string(),
        client: "Cliente Demo S.A.".to_string(),
        project_type: "pentest".to_string(),
        start_date: "2026-01-13".to_string(),
        end_date: "2026-01-24".to_string(),
        scope: vec![
            "https://app.demo.example".to_string(),
            "https://api.demo.example".to_string(),
        ],
        team: vec![
            TeamMember {
                name: "Analista de Seguridad".to_string(),
                role: "Pentester".to_string(),
            },
            TeamMember {
                name: "Lider Tecnico".to_string(),
                role: "Revision y QA".to_string(),
            },
        ],
        sections: default_sections(),
        finding_order: order,
        ..Default::default()
    };
    write_project_meta(root, &id, &meta)?;
    Ok((id, meta))
}

/// Tres hallazgos de ejemplo con contenido generico pero realista.
fn example_findings() -> Vec<Finding> {
    use crate::models::{CvssVersion, FindingStatus, Severity};

    vec![
        Finding {
            id: "001-inyeccion-sql-en-login".to_string(),
            meta: FindingMeta {
                title: "Inyeccion SQL en el formulario de autenticacion".to_string(),
                severity: Severity::Critical,
                cvss_version: CvssVersion::V31,
                cvss: "9.8".to_string(),
                cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H".to_string(),
                cwe: vec!["CWE-89".to_string()],
                status: FindingStatus::Open,
                affected: vec!["https://app.demo.example/login".to_string()],
                hidden: false,
                new_in_retest: false,
            },
            body: "## Descripcion\n\nEl campo de usuario del formulario de inicio de sesion no valida ni parametriza la entrada antes de construir la consulta SQL. Esto permite a un atacante alterar la logica de la consulta e interactuar directamente con la base de datos.\n\n## Impacto\n\nUn atacante puede omitir la autenticacion, extraer informacion sensible de la base de datos (credenciales, datos personales) y, segun la configuracion del motor, ejecutar comandos en el sistema operativo subyacente.\n\n## Prueba de concepto\n\nEnviando el siguiente valor en el campo de usuario se omite la verificacion de credenciales:\n\n```\nusuario: admin' OR '1'='1' -- \npassword: cualquier_cosa\n```\n\nLa aplicacion responde con una sesion valida sin conocer la contrasena real.\n\n## Remediacion\n\nUtilizar consultas parametrizadas (prepared statements) o un ORM que las aplique por defecto. Validar y normalizar toda entrada del usuario y aplicar el principio de minimo privilegio a la cuenta de base de datos.".to_string(),
        },
        Finding {
            id: "002-idor-en-api".to_string(),
            meta: FindingMeta {
                title: "Referencia directa insegura a objetos (IDOR) en la API".to_string(),
                severity: Severity::High,
                cvss_version: CvssVersion::V40,
                cvss: "8.7".to_string(),
                cvss_vector: "CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N"
                    .to_string(),
                cwe: vec!["CWE-639".to_string()],
                status: FindingStatus::Open,
                affected: vec!["https://api.demo.example/v1/users/{id}".to_string()],
                hidden: false,
                new_in_retest: false,
            },
            body: "## Descripcion\n\nEl endpoint de la API que devuelve datos de un usuario utiliza un identificador numerico secuencial sin verificar que el solicitante tenga permiso sobre ese recurso. Cualquier usuario autenticado puede acceder a los datos de otros.\n\n## Impacto\n\nExposicion masiva de informacion de otros usuarios (datos personales, configuracion de cuenta) recorriendo los identificadores. Constituye una violacion de confidencialidad a nivel de toda la base de usuarios.\n\n## Prueba de concepto\n\nAutenticado como el usuario con identificador 1001, la siguiente peticion devuelve los datos de otro usuario:\n\n```\nGET /v1/users/1002 HTTP/1.1\nHost: api.demo.example\nAuthorization: Bearer <token-del-usuario-1001>\n```\n\nLa respuesta contiene los datos del usuario 1002.\n\n## Remediacion\n\nAplicar controles de autorizacion a nivel de objeto en cada peticion, verificando que el recurso pertenezca al usuario autenticado. Considerar el uso de identificadores no predecibles (UUID) como defensa en profundidad.".to_string(),
        },
        Finding {
            id: "003-cabeceras-seguridad-ausentes".to_string(),
            meta: FindingMeta {
                title: "Cabeceras de seguridad HTTP ausentes".to_string(),
                severity: Severity::Low,
                cvss_version: CvssVersion::V31,
                cvss: "3.1".to_string(),
                cvss_vector: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N".to_string(),
                cwe: vec!["CWE-693".to_string()],
                status: FindingStatus::Open,
                affected: vec!["https://app.demo.example".to_string()],
                hidden: false,
                new_in_retest: false,
            },
            body: "## Descripcion\n\nLas respuestas de la aplicacion no incluyen varias cabeceras de seguridad recomendadas, como Content-Security-Policy, Strict-Transport-Security y X-Content-Type-Options.\n\n## Impacto\n\nLa ausencia de estas cabeceras facilita ataques del lado del cliente como cross-site scripting, clickjacking o la degradacion de la conexion a HTTP. Por si sola es de bajo riesgo, pero amplifica el impacto de otras vulnerabilidades.\n\n## Prueba de concepto\n\nAl inspeccionar las cabeceras de respuesta de la pagina principal no se observan las cabeceras de seguridad mencionadas:\n\n```\nGET / HTTP/1.1\nHost: app.demo.example\n```\n\n## Remediacion\n\nConfigurar el servidor web o la aplicacion para enviar las cabeceras de seguridad apropiadas. Definir una Content-Security-Policy restrictiva, habilitar HSTS y agregar X-Content-Type-Options: nosniff.".to_string(),
        },
    ]
}

/// Scaffold de secciones precargadas segun el tipo de proyecto.
fn sections_for_type(project_type: &str) -> Vec<crate::models::ReportSection> {
    match project_type {
        "oscp" | "htb" => oscp_sections(),
        "redteam" => sections_from(REDTEAM_SECTION_BOILERPLATE),
        "ejecutivo" => sections_from(EJECUTIVO_SECTION_BOILERPLATE),
        "documento" => sections_from(DOCUMENTO_SECTION_BOILERPLATE),
        "retest" => sections_from(RETEST_SECTION_BOILERPLATE),
        // pentest y desconocidos: scaffold generico de pentest.
        _ => default_sections(),
    }
}

/// Construye secciones a partir de una tabla (clave, titulo, cuerpo).
fn sections_from(boilerplate: &[(&str, &str, &str)]) -> Vec<crate::models::ReportSection> {
    use crate::models::ReportSection;
    boilerplate
        .iter()
        .map(|(key, title, body)| ReportSection {
            key: key.to_string(),
            title: title.to_string(),
            body: body.to_string(),
            enabled: true,
        })
        .collect()
}

/// Secciones de reporte por defecto (pentest), con texto boilerplate generico
/// pero entendible. El pentester edita o reemplaza; nunca parte de cero.
fn default_sections() -> Vec<crate::models::ReportSection> {
    sections_from(SECTION_BOILERPLATE)
}

/// Secciones para el modo examen OSCP, con la estructura que espera OffSec.
/// Cada maquina/objetivo se documenta como un hallazgo aparte (su IP va en
/// "activos afectados"); estas secciones son la prosa que las enmarca.
fn oscp_sections() -> Vec<crate::models::ReportSection> {
    sections_from(OSCP_SECTION_BOILERPLATE)
}

/// Boilerplate para red team: narrativa de ataque por sobre la lista de hallazgos.
const REDTEAM_SECTION_BOILERPLATE: &[(&str, &str, &str)] = &[
    (
        "resumen",
        "Resumen ejecutivo",
        "Se ejecuto un ejercicio de red team simulando a un adversario real contra los activos en alcance. El objetivo no fue enumerar todas las vulnerabilidades, sino demostrar el impacto de una intrusion siguiendo objetivos concretos (acceso a datos sensibles, control de dominio, etc.).\n\nEste resumen esta dirigido a gestion: describe el resultado del ejercicio y el nivel de exposicion sin entrar en detalle tecnico.",
    ),
    (
        "alcance-reglas",
        "Alcance y reglas de enfrentamiento",
        "Se detallan los activos en alcance, la ventana de ejecucion y las reglas acordadas (objetivos, tecnicas permitidas, restricciones y contactos de escalamiento).",
    ),
    (
        "narrativa",
        "Narrativa del ataque",
        "Relato cronologico de la intrusion: acceso inicial, ejecucion, persistencia, escalada de privilegios, movimiento lateral y cumplimiento de los objetivos. Cada paso enlaza con los hallazgos tecnicos que lo habilitaron.",
    ),
    (
        "conclusiones",
        "Conclusiones y recomendaciones",
        "Lecciones del ejercicio: que detecto y que no detecto la defensa, y las mejoras prioritarias para reducir el riesgo de una intrusion real.",
    ),
];

/// Boilerplate para el informe ejecutivo / no tecnico (sin hallazgos).
const EJECUTIVO_SECTION_BOILERPLATE: &[(&str, &str, &str)] = &[
    (
        "resumen",
        "Resumen ejecutivo",
        "Sintesis del trabajo realizado y de sus resultados, en lenguaje de negocio. Describe el nivel de riesgo general y los puntos que requieren atencion de la direccion, sin detalle tecnico.",
    ),
    (
        "alcance",
        "Alcance y contexto",
        "Que se evaluo, durante que periodo y con que objetivo de negocio. Contexto necesario para interpretar las conclusiones.",
    ),
    (
        "conclusiones",
        "Conclusiones",
        "Estado general y principales aprendizajes, orientados a la toma de decisiones.",
    ),
    (
        "recomendaciones",
        "Recomendaciones",
        "Acciones priorizadas (corto, mediano y largo plazo) con su impacto esperado en el nivel de riesgo.",
    ),
];

/// Boilerplate minimo para un documento libre: una sola seccion abierta.
const DOCUMENTO_SECTION_BOILERPLATE: &[(&str, &str, &str)] = &[(
    "contenido",
    "Contenido",
    "Escribe aqui el contenido del documento. Puedes crear todas las secciones que necesites desde la pestaña Reporte.",
)];

/// Boilerplate para el retest / verificacion de remediacion.
const RETEST_SECTION_BOILERPLATE: &[(&str, &str, &str)] = &[
    (
        "alcance-retest",
        "Alcance del retest",
        "Hallazgos del informe original que fueron re-evaluados, fecha del retest y metodologia usada para verificar cada remediacion.",
    ),
    (
        "resumen",
        "Resumen del estado",
        "Vision general del avance de la remediacion: cuantos hallazgos se corrigieron, cuantos siguen abiertos y cuantos fueron aceptados como riesgo.",
    ),
    (
        "conclusiones",
        "Conclusiones",
        "Evaluacion del progreso y recomendaciones sobre los hallazgos que continuan abiertos.",
    ),
];

/// Boilerplate de las secciones del reporte de examen OSCP. Sin acentos para
/// mantener la convencion del resto del codigo; el candidato edita el texto.
const OSCP_SECTION_BOILERPLATE: &[(&str, &str, &str)] = &[
    (
        "introduction",
        "Introduction",
        "El presente reporte documenta la prueba de penetracion realizada como parte del examen de certificacion. Contiene todos los pasos ejecutados para comprometer los sistemas del entorno de examen, presentados de forma que el evaluador pueda reproducir cada resultado.\n\nEl objetivo fue evaluar la red, identificar los sistemas en alcance y explotar las debilidades encontradas, documentando cada hallazgo con la evidencia correspondiente (capturas, codigo de explotacion y el contenido de los archivos local.txt / proof.txt cuando aplique).",
    ),
    (
        "high-level-summary",
        "High-Level Summary",
        "Se realizo una prueba de penetracion interna contra la red de examen. Se logro acceso administrativo o de root en los sistemas comprometidos, principalmente por parches faltantes y configuraciones inseguras.\n\nLos sistemas comprometidos y el vector inicial de cada uno se resumen a continuacion:\n\n- IP (hostname) - Nombre del exploit inicial\n- IP (hostname) - Nombre del exploit inicial\n- IP (hostname) - Nombre del exploit inicial",
    ),
    (
        "recommendations",
        "Recommendations",
        "Se recomienda aplicar los parches correspondientes a las vulnerabilidades identificadas y mantener un programa regular de actualizaciones. Las configuraciones inseguras deben corregirse y revisarse periodicamente para evitar su reaparicion.",
    ),
    (
        "methodology",
        "Methodology",
        "Se utilizo un enfoque metodico y ampliamente adoptado de pruebas de penetracion, organizado en las siguientes fases:\n\n- Information Gathering: identificacion del alcance y de las IP objetivo.\n- Service Enumeration: descubrimiento de servicios y puertos abiertos en cada sistema.\n- Penetration: obtencion de acceso a los sistemas en alcance.\n- Maintaining Access: aseguramiento del acceso obtenido sobre los sistemas comprometidos.\n- House Cleaning: eliminacion de cuentas, herramientas y artefactos introducidos durante la prueba.\n\nEl detalle por maquina (enumeracion, acceso inicial, escalada de privilegios y post-explotacion) se encuentra en la seccion de hallazgos.",
    ),
    (
        "additional-items",
        "Additional Items",
        "Esta seccion se reserva para informacion complementaria no incluida en el resto del reporte: contenido de los archivos local.txt / proof.txt, codigo completo de buffer overflow u otros apendices relevantes.",
    ),
];

/// Texto boilerplate (clave, titulo, cuerpo markdown) para las secciones base.
const SECTION_BOILERPLATE: &[(&str, &str, &str)] = &[
    (
        "resumen",
        "Resumen ejecutivo",
        "Durante el periodo evaluado se realizo una prueba de penetracion sobre los activos definidos en el alcance. El objetivo fue identificar vulnerabilidades que pudieran comprometer la confidencialidad, integridad o disponibilidad de la informacion del cliente.\n\nLa evaluacion identifico varios hallazgos de distinta severidad. Los de mayor criticidad permiten el acceso no autorizado a datos sensibles y deben atenderse de forma prioritaria. A continuacion se detallan los resultados tecnicos y las recomendaciones de remediacion.\n\nEste documento esta dirigido tanto a perfiles tecnicos como de gestion: el presente resumen ofrece una vision general, mientras que la seccion de hallazgos contiene el detalle reproducible de cada vulnerabilidad.",
    ),
    (
        "alcance",
        "Alcance",
        "La evaluacion se limito a los activos listados en la portada de este reporte. Cualquier sistema, dominio o servicio no incluido en esa lista quedo explicitamente fuera de alcance.\n\nLas pruebas se realizaron en un entorno acordado con el cliente y dentro de la ventana de tiempo definida. No se realizaron ataques de denegacion de servicio ni acciones destructivas sobre los datos.",
    ),
    (
        "metodologia",
        "Metodologia",
        "La evaluacion siguio un enfoque de caja gris alineado con metodologias reconocidas de la industria (OWASP Web Security Testing Guide y PTES). El trabajo se organizo en las siguientes fases:\n\n- Reconocimiento e identificacion de la superficie de ataque.\n- Enumeracion de servicios, tecnologias y puntos de entrada.\n- Identificacion de vulnerabilidades de forma manual y asistida por herramientas.\n- Explotacion controlada para confirmar el impacto real, evitando afectar la operacion.\n- Documentacion de hallazgos con evidencia reproducible y recomendaciones.\n\nCada hallazgo se clasifico segun su severidad utilizando el estandar CVSS.",
    ),
    (
        "conclusiones",
        "Conclusiones",
        "El nivel de seguridad general de los activos evaluados se considera mejorable. Si bien existen controles adecuados en varias areas, se identificaron debilidades que un atacante podria aprovechar.\n\nSe recomienda priorizar la remediacion de los hallazgos de severidad critica y alta, y planificar la correccion de los restantes segun el apetito de riesgo de la organizacion. Tras aplicar las correcciones, se sugiere una nueva verificacion para confirmar su efectividad.",
    ),
];

pub fn read_project_meta(root: &Path, id: &str) -> Result<ProjectMeta> {
    validate_id(id)?;
    let path = project_yaml_path(root, id);
    if !path.exists() {
        return Err(WorkspaceError::ProjectNotFound(id.to_string()));
    }
    let content = fs::read_to_string(path)?;
    let mut meta: ProjectMeta = serde_yaml::from_str(&content)?;
    // Layout del cuerpo consistente con las secciones (idempotente; sintetiza el
    // default del tipo en project.yaml previos a los bloques). Asi load_project
    // devuelve el layout efectivo al frontend.
    meta.reconcile_layout();
    Ok(meta)
}

pub fn write_project_meta(root: &Path, id: &str, meta: &ProjectMeta) -> Result<()> {
    validate_id(id)?;
    let yaml = serde_yaml::to_string(meta)?;
    fs::write(project_yaml_path(root, id), yaml)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Hallazgos
// ---------------------------------------------------------------------------

fn findings_dir(root: &Path, project_id: &str) -> PathBuf {
    project_dir(root, project_id).join("findings")
}

fn finding_path(root: &Path, project_id: &str, finding_id: &str) -> PathBuf {
    findings_dir(root, project_id).join(format!("{finding_id}.md"))
}

fn count_findings(root: &Path, project_id: &str) -> Result<usize> {
    let dir = findings_dir(root, project_id);
    if !dir.exists() {
        return Ok(0);
    }
    let mut n = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.path().extension().is_some_and(|e| e == "md") {
            n += 1;
        }
    }
    Ok(n)
}

fn parse_finding_file(path: &Path) -> Result<Finding> {
    let content = fs::read_to_string(path)?;
    let source = path.display().to_string();
    let (yaml, body) = split_front_matter(&content, &source)?;
    let meta: FindingMeta = serde_yaml::from_str(&yaml)?;
    let id = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(Finding { id, meta, body })
}

/// Lista los hallazgos de un proyecto, respetando el orden de project.yaml.
pub fn list_findings(root: &Path, project_id: &str) -> Result<Vec<Finding>> {
    validate_id(project_id)?;
    let dir = findings_dir(root, project_id);
    let mut findings: Vec<Finding> = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
                findings.push(parse_finding_file(&path)?);
            }
        }
    }

    // Ordenar por finding_order; los no listados van al final por id.
    let order = read_project_meta(root, project_id)
        .map(|m| m.finding_order)
        .unwrap_or_default();
    findings.sort_by_key(|f| {
        order
            .iter()
            .position(|id| id == &f.id)
            .unwrap_or(usize::MAX)
    });
    Ok(findings)
}

pub fn load_finding(root: &Path, project_id: &str, finding_id: &str) -> Result<Finding> {
    validate_id(project_id)?;
    validate_id(finding_id)?;
    let path = finding_path(root, project_id, finding_id);
    if !path.exists() {
        return Err(WorkspaceError::FindingNotFound(finding_id.to_string()));
    }
    parse_finding_file(&path)
}

/// Crea un hallazgo vacio con prefijo numerico incremental.
pub fn create_finding(root: &Path, project_id: &str, title: &str) -> Result<Finding> {
    validate_id(project_id)?;
    let dir = findings_dir(root, project_id);
    fs::create_dir_all(&dir)?;

    let next = next_finding_number(&dir)?;
    let id = format!("{:03}-{}", next, slugify(title));
    let finding = Finding {
        id: id.clone(),
        meta: FindingMeta {
            title: title.to_string(),
            ..Default::default()
        },
        body: default_finding_body(),
    };
    write_finding(root, project_id, &finding)?;

    // Anexar al orden del proyecto.
    let mut meta = read_project_meta(root, project_id)?;
    if !meta.finding_order.contains(&id) {
        meta.finding_order.push(id);
        write_project_meta(root, project_id, &meta)?;
    }
    Ok(finding)
}

fn default_finding_body() -> String {
    "## Descripcion\n\n## Impacto\n\n## Prueba de concepto\n\n## Remediacion\n".to_string()
}

fn next_finding_number(dir: &Path) -> Result<u32> {
    let mut max = 0u32;
    if dir.exists() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(prefix) = name.split('-').next() {
                if let Ok(n) = prefix.parse::<u32>() {
                    max = max.max(n);
                }
            }
        }
    }
    Ok(max + 1)
}

/// Escribe un hallazgo a disco (id estable, no se renombra al cambiar titulo).
pub fn write_finding(root: &Path, project_id: &str, finding: &Finding) -> Result<()> {
    validate_id(project_id)?;
    validate_id(&finding.id)?;
    let content = join_front_matter(&finding.meta, &finding.body)?;
    fs::write(finding_path(root, project_id, &finding.id), content)?;
    Ok(())
}

pub fn delete_finding(root: &Path, project_id: &str, finding_id: &str) -> Result<()> {
    validate_id(project_id)?;
    validate_id(finding_id)?;
    let path = finding_path(root, project_id, finding_id);
    if path.exists() {
        fs::remove_file(path)?;
    }
    let mut meta = read_project_meta(root, project_id)?;
    meta.finding_order.retain(|id| id != finding_id);
    write_project_meta(root, project_id, &meta)?;
    Ok(())
}

pub fn reorder_findings(root: &Path, project_id: &str, order: Vec<String>) -> Result<()> {
    validate_id(project_id)?;
    for id in &order {
        validate_id(id)?;
    }
    let mut meta = read_project_meta(root, project_id)?;
    meta.finding_order = order;
    write_project_meta(root, project_id, &meta)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Assets (evidencias: imagenes y otros adjuntos)
// ---------------------------------------------------------------------------

/// Guarda un asset en `<proyecto>/assets/<uuid>.<ext>` y devuelve la ruta
/// relativa (ej "assets/ab12...png"), apta para referenciar en markdown.
/// El nombre es un UUID para evitar colisiones y mantener el orden estable.
pub fn save_asset(root: &Path, project_id: &str, ext: &str, bytes: &[u8]) -> Result<String> {
    validate_id(project_id)?;
    let dir = project_dir(root, project_id).join("assets");
    fs::create_dir_all(&dir)?;

    // Extension saneada: solo alfanumericos, en minuscula, corta.
    let clean: String = ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect::<String>()
        .to_ascii_lowercase();
    let ext = if clean.is_empty() {
        "bin".to_string()
    } else {
        clean
    };

    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    fs::write(dir.join(&name), bytes)?;
    Ok(format!("assets/{name}"))
}

/// Guarda un asset de marca (logo, fondo de portada) en `<root>/branding/`.
/// Devuelve una ruta root-relative ("/branding/<uuid>.<ext>") para que Typst
/// la resuelva con `--root` en el workspace desde cualquier proyecto.
pub fn save_branding_asset(root: &Path, ext: &str, bytes: &[u8]) -> Result<String> {
    let dir = root.join("branding");
    fs::create_dir_all(&dir)?;

    let clean: String = ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect::<String>()
        .to_ascii_lowercase();
    let ext = if clean.is_empty() {
        "bin".to_string()
    } else {
        clean
    };

    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    fs::write(dir.join(&name), bytes)?;
    Ok(format!("/branding/{name}"))
}

// ---------------------------------------------------------------------------
// Libreria (hallazgos reutilizables + snippets)
// ---------------------------------------------------------------------------

fn library_findings_dir(root: &Path) -> PathBuf {
    root.join("library/findings")
}

fn library_snippets_dir(root: &Path) -> PathBuf {
    root.join("library/snippets")
}

pub fn list_finding_templates(root: &Path) -> Result<Vec<FindingTemplate>> {
    let dir = library_findings_dir(root);
    let mut out = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
                let f = parse_finding_file(&path)?;
                out.push(FindingTemplate {
                    id: f.id,
                    meta: f.meta,
                    body: f.body,
                });
            }
        }
    }
    out.sort_by_key(|a| a.meta.title.to_lowercase());
    Ok(out)
}

pub fn save_finding_template(root: &Path, template: &FindingTemplate) -> Result<()> {
    let dir = library_findings_dir(root);
    fs::create_dir_all(&dir)?;
    let id = if template.id.is_empty() {
        slugify(&template.meta.title)
    } else {
        template.id.clone()
    };
    validate_id(&id)?;
    let body = join_front_matter(&template.meta, &template.body)?;
    fs::write(dir.join(format!("{id}.md")), body)?;
    Ok(())
}

/// Clona una plantilla de hallazgo a un proyecto, reemplazando {{variables}}.
pub fn instantiate_template(
    root: &Path,
    project_id: &str,
    template_id: &str,
    vars: &std::collections::HashMap<String, String>,
) -> Result<Finding> {
    validate_id(project_id)?;
    validate_id(template_id)?;
    let path = library_findings_dir(root).join(format!("{template_id}.md"));
    if !path.exists() {
        return Err(WorkspaceError::FindingNotFound(template_id.to_string()));
    }
    let template = parse_finding_file(&path)?;

    let title = replace_vars(&template.meta.title, vars);
    let body = replace_vars(&template.body, vars);

    // Crear un hallazgo nuevo en el proyecto reutilizando metadata de la plantilla.
    let dir = findings_dir(root, project_id);
    fs::create_dir_all(&dir)?;
    let next = next_finding_number(&dir)?;
    let id = format!("{:03}-{}", next, slugify(&title));

    let mut meta = template.meta.clone();
    meta.title = title;
    let finding = Finding {
        id: id.clone(),
        meta,
        body,
    };
    write_finding(root, project_id, &finding)?;

    let mut pmeta = read_project_meta(root, project_id)?;
    if !pmeta.finding_order.contains(&id) {
        pmeta.finding_order.push(id);
        write_project_meta(root, project_id, &pmeta)?;
    }
    Ok(finding)
}

/// Reemplaza ocurrencias de {{clave}} por su valor.
fn replace_vars(input: &str, vars: &std::collections::HashMap<String, String>) -> String {
    let mut out = input.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("{{{{{key}}}}}"), value);
    }
    out
}

pub fn list_snippets(root: &Path) -> Result<Vec<Snippet>> {
    let dir = library_snippets_dir(root);
    let mut out = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
                let content = fs::read_to_string(&path)?;
                let id = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                // Primera linea "# titulo", resto cuerpo.
                let (title, body) = split_snippet(&content);
                out.push(Snippet { id, title, body });
            }
        }
    }
    out.sort_by_key(|a| a.title.to_lowercase());
    Ok(out)
}

fn split_snippet(content: &str) -> (String, String) {
    let mut lines = content.lines();
    let first = lines.next().unwrap_or("");
    let title = first.trim_start_matches('#').trim().to_string();
    let body = lines.collect::<Vec<_>>().join("\n").trim().to_string();
    (title, body)
}

pub fn save_snippet(root: &Path, snippet: &Snippet) -> Result<()> {
    let dir = library_snippets_dir(root);
    fs::create_dir_all(&dir)?;
    let id = if snippet.id.is_empty() {
        slugify(&snippet.title)
    } else {
        snippet.id.clone()
    };
    validate_id(&id)?;
    let content = format!("# {}\n\n{}\n", snippet.title, snippet.body.trim_end());
    fs::write(dir.join(format!("{id}.md")), content)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/// Devuelve un nombre de directorio unico dentro de root (agrega sufijo -N).
fn unique_dir(root: &Path, base: &str) -> String {
    if !root.join(base).exists() {
        return base.to_string();
    }
    let mut n = 2;
    loop {
        let candidate = format!("{base}-{n}");
        if !root.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("SQL Injection en login"), "sql-injection-en-login");
        assert_eq!(slugify("IDOR /api/users"), "idor-api-users");
        assert_eq!(slugify("   "), "hallazgo");
    }

    #[test]
    fn front_matter_roundtrip() {
        let meta = FindingMeta {
            title: "Test".into(),
            ..Default::default()
        };
        let doc = join_front_matter(&meta, "## Cuerpo\n\ntexto").unwrap();
        let (yaml, body) = split_front_matter(&doc, "test").unwrap();
        let parsed: FindingMeta = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(parsed.title, "Test");
        assert!(body.starts_with("## Cuerpo"));
    }

    #[test]
    fn front_matter_missing_errors() {
        assert!(split_front_matter("sin front matter", "x").is_err());
    }

    #[test]
    fn replace_vars_works() {
        let mut vars = std::collections::HashMap::new();
        vars.insert("cliente".to_string(), "ACME".to_string());
        vars.insert("target".to_string(), "app.acme.com".to_string());
        let out = replace_vars("SQLi en {{cliente}} ({{target}})", &vars);
        assert_eq!(out, "SQLi en ACME (app.acme.com)");
    }

    #[test]
    fn workspace_and_project_lifecycle() {
        let tmp = std::env::temp_dir().join(format!("pudu-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_workspace(&tmp, "Test WS").unwrap();
        assert!(tmp.join("workspace.yaml").exists());

        let (pid, _) = create_project(&tmp, "Web App", "ACME", "pentest").unwrap();
        let f = create_finding(&tmp, &pid, "SQL Injection en login").unwrap();
        assert!(f.id.starts_with("001-"));

        let listed = list_findings(&tmp, &pid).unwrap();
        assert_eq!(listed.len(), 1);

        let projects = list_projects(&tmp).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].finding_count, 1);

        delete_finding(&tmp, &pid, &f.id).unwrap();
        assert_eq!(list_findings(&tmp, &pid).unwrap().len(), 0);

        // Borrar el proyecto elimina su carpeta y lo saca del listado.
        delete_project(&tmp, &pid).unwrap();
        assert!(!project_dir(&tmp, &pid).exists());
        assert_eq!(list_projects(&tmp).unwrap().len(), 0);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn project_type_seeds_matching_scaffold() {
        let tmp = std::env::temp_dir().join(format!("pudu-type-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_workspace(&tmp, "WS").unwrap();

        // Pentest: scaffold generico.
        let (pentest, meta) = create_project(&tmp, "Pentest", "ACME", "pentest").unwrap();
        assert_eq!(meta.project_type, "pentest");
        let pmeta = read_project_meta(&tmp, &pentest).unwrap();
        assert!(pmeta.sections.iter().any(|s| s.key == "metodologia"));
        assert!(!pmeta.sections.iter().any(|s| s.key == "high-level-summary"));

        // OSCP: scaffold del examen.
        let (exam, _) = create_project(&tmp, "Examen OSCP", "OffSec", "oscp").unwrap();
        let emeta = read_project_meta(&tmp, &exam).unwrap();
        assert_eq!(emeta.project_type, "oscp");
        assert!(emeta.sections.iter().any(|s| s.key == "high-level-summary"));

        // Ejecutivo: scaffold no tecnico.
        let (eje, _) = create_project(&tmp, "Ejecutivo", "ACME", "ejecutivo").unwrap();
        let xmeta = read_project_meta(&tmp, &eje).unwrap();
        assert!(xmeta.sections.iter().any(|s| s.key == "recomendaciones"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn rejects_path_traversal_ids() {
        let tmp = std::env::temp_dir().join(format!("pudu-trav-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_workspace(&tmp, "WS").unwrap();
        let (pid, _) = create_project(&tmp, "Web", "ACME", "pentest").unwrap();

        // Ids con traversal o separadores deben fallar, no escribir fuera.
        assert!(load_finding(&tmp, "../../etc", "passwd").is_err());
        assert!(load_finding(&tmp, &pid, "../../../tmp/evil").is_err());
        assert!(read_project_meta(&tmp, "..").is_err());
        assert!(save_asset(&tmp, "../escape", "png", &[1]).is_err());
        let bad = Finding {
            id: "../../evil".to_string(),
            meta: FindingMeta::default(),
            body: String::new(),
        };
        assert!(write_finding(&tmp, &pid, &bad).is_err());

        // Un id normal sigue funcionando.
        assert!(validate_id("001-sqli-login").is_ok());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn save_asset_writes_uuid_file() {
        let tmp = std::env::temp_dir().join(format!("pudu-asset-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_workspace(&tmp, "WS").unwrap();
        let (pid, _) = create_project(&tmp, "Web", "ACME", "pentest").unwrap();

        let rel = save_asset(&tmp, &pid, "PNG", &[1, 2, 3, 4]).unwrap();
        assert!(rel.starts_with("assets/"));
        assert!(rel.ends_with(".png"));
        let abs = project_dir(&tmp, &pid).join(&rel);
        assert_eq!(fs::read(abs).unwrap(), vec![1, 2, 3, 4]);

        // Extension vacia -> bin.
        let rel2 = save_asset(&tmp, &pid, "", &[9]).unwrap();
        assert!(rel2.ends_with(".bin"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn example_project_is_complete() {
        let tmp = std::env::temp_dir().join(format!("pudu-ex-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_workspace(&tmp, "WS").unwrap();

        let (id, meta) = create_example_project(&tmp).unwrap();
        assert_eq!(meta.client, "Cliente Demo S.A.");
        assert!(meta.sections.iter().all(|s| !s.body.trim().is_empty()));
        assert_eq!(meta.scope.len(), 2);

        let findings = list_findings(&tmp, &id).unwrap();
        assert_eq!(findings.len(), 3);
        // El orden definido en finding_order se respeta.
        assert_eq!(findings[0].id, "001-inyeccion-sql-en-login");
        assert!(findings
            .iter()
            .any(|f| f.meta.severity == crate::models::Severity::Critical));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn workspace_stats_agrega_severidades() {
        let tmp = std::env::temp_dir().join(format!("pudu-stats-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_workspace(&tmp, "WS").unwrap();
        create_example_project(&tmp).unwrap();

        let stats = workspace_stats(&tmp).unwrap();
        assert_eq!(stats.total_projects, 1);
        assert_eq!(stats.total_findings, 3);
        // El proyecto de ejemplo tiene 1 critica, 1 alta y 1 baja, todas abiertas.
        assert_eq!(stats.severity.critical, 1);
        assert_eq!(stats.severity.high, 1);
        assert_eq!(stats.severity.low, 1);
        assert_eq!(stats.open_findings, 3);
        assert_eq!(stats.projects.len(), 1);
        assert_eq!(stats.projects[0].total, 3);
        assert_eq!(stats.projects[0].severity.critical, 1);

        let _ = fs::remove_dir_all(&tmp);
    }
}
