//! Punto de entrada de la libreria Tauri: estado de la app y comandos IPC.
//!
//! Cada comando devuelve `Result<T, String>` (convencion de README.dev.md).
//! La logica vive en los modulos enfocados (workspace, db, pdf, cvss, git);
//! aqui solo se orquesta y se mapean errores a String para el frontend.

mod db;
mod git;
mod mcp;
mod pdf;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

// Logica compartida en el crate pudureport-core.
use pudureport_core::models::{
    CvssResult, CvssVersion, Finding, FindingTemplate, PdfTemplate, ProjectMeta, ProjectSummary,
    Snippet, WorkspaceMeta, WorkspaceStats,
};
use pudureport_core::{cvss, workspace};

const STORE_FILE: &str = "settings.json";
const STORE_KEY_WORKSPACE: &str = "workspace_path";

/// Estado global: ruta del workspace actualmente abierto.
#[derive(Default)]
struct AppState {
    workspace: Mutex<Option<PathBuf>>,
}

/// Helper: devuelve la ruta del workspace abierto o un error legible.
fn current_root(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .workspace
        .lock()
        .map_err(|_| "estado bloqueado".to_string())?
        .clone()
        .ok_or_else(|| "no hay un workspace abierto".to_string())
}

/// Resuelve el directorio de plantillas .typ base empaquetadas.
fn templates_dir(app: &AppHandle) -> PathBuf {
    if let Ok(resource) = app.path().resource_dir() {
        // El recurso "../templates/*" se bundlea bajo "_up_/templates" (Tauri
        // reemplaza el ".." por "_up_"). Tambien probamos "templates" por si la
        // config cambia a una ruta sin "..".
        for sub in ["_up_/templates", "templates"] {
            let candidate = resource.join(sub);
            if candidate.exists() {
                return candidate;
            }
        }
    }
    // Fallback para desarrollo (cargo tauri dev): repo/templates.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("templates"))
        .unwrap_or_else(|| PathBuf::from("templates"))
}

/// Habilita la lectura via protocolo asset: SOLO del workspace abierto.
/// El scope estatico esta vacio; aqui se permite dinamicamente la carpeta
/// elegida, evitando exponer todo el disco a la webview.
fn allow_workspace_assets(app: &AppHandle, root: &std::path::Path) {
    let _ = app.asset_protocol_scope().allow_directory(root, true);
}

fn persist_workspace(app: &AppHandle, path: &std::path::Path) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(STORE_KEY_WORKSPACE, path.to_string_lossy().to_string());
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

const STORE_KEY_RECENTS: &str = "recent_workspaces";
const MAX_RECENTS: usize = 20;

/// Entrada persistida de un workspace reciente (pantalla de bienvenida).
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct RecentEntry {
    path: String,
    name: String,
}

/// Vista de un workspace reciente para el frontend (incluye si sigue existiendo).
#[derive(serde::Serialize)]
struct RecentWorkspace {
    path: String,
    name: String,
    exists: bool,
}

fn read_recents(app: &AppHandle) -> Vec<RecentEntry> {
    let Ok(store) = app.store(STORE_FILE) else {
        return Vec::new();
    };
    store
        .get(STORE_KEY_RECENTS)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn write_recents(app: &AppHandle, list: &[RecentEntry]) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        STORE_KEY_RECENTS,
        serde_json::to_value(list).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Mueve un workspace al frente de la lista de recientes (dedup por ruta).
fn push_recent(app: &AppHandle, path: &std::path::Path, name: &str) {
    let path_s = path.to_string_lossy().to_string();
    let mut list = read_recents(app);
    list.retain(|e| e.path != path_s);
    list.insert(
        0,
        RecentEntry {
            path: path_s,
            name: name.to_string(),
        },
    );
    list.truncate(MAX_RECENTS);
    let _ = write_recents(app, &list);
}

/// Lista los workspaces recientes (mas reciente primero) para la bienvenida.
#[tauri::command]
fn list_recent_workspaces(app: AppHandle) -> Result<Vec<RecentWorkspace>, String> {
    Ok(read_recents(&app)
        .into_iter()
        .map(|e| RecentWorkspace {
            exists: std::path::Path::new(&e.path)
                .join("workspace.yaml")
                .exists(),
            path: e.path,
            name: e.name,
        })
        .collect())
}

/// Quita un workspace de la lista de recientes (no borra nada del disco).
#[tauri::command]
fn remove_recent_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let mut list = read_recents(&app);
    list.retain(|e| e.path != path);
    write_recents(&app, &list)
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

#[tauri::command]
async fn pick_workspace(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    match folder {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn get_stored_workspace(app: AppHandle) -> Result<Option<String>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(store
        .get(STORE_KEY_WORKSPACE)
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
fn open_workspace(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<WorkspaceMeta, String> {
    let root = PathBuf::from(&path);
    let meta = workspace::read_workspace_meta(&root).map_err(|e| e.to_string())?;
    *state.workspace.lock().map_err(|_| "estado bloqueado")? = Some(root.clone());
    persist_workspace(&app, &root)?;
    push_recent(&app, &root, &meta.name);
    allow_workspace_assets(&app, &root);
    // Reindexar en segundo plano logico (no critico si falla).
    let _ = db::reindex(&root);
    Ok(meta)
}

#[tauri::command]
fn create_workspace(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    name: String,
) -> Result<WorkspaceMeta, String> {
    let root = PathBuf::from(&path);
    let meta = workspace::create_workspace(&root, &name).map_err(|e| e.to_string())?;
    *state.workspace.lock().map_err(|_| "estado bloqueado")? = Some(root.clone());
    persist_workspace(&app, &root)?;
    push_recent(&app, &root, &meta.name);
    allow_workspace_assets(&app, &root);
    Ok(meta)
}

#[tauri::command]
fn save_workspace_meta(state: State<AppState>, meta: WorkspaceMeta) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::write_workspace_meta(&root, &meta).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

/// Resumen del workspace para el dashboard de Inicio (totales + severidades).
#[tauri::command]
fn workspace_stats(state: State<AppState>) -> Result<WorkspaceStats, String> {
    let root = current_root(&state)?;
    workspace::workspace_stats(&root).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_projects(state: State<AppState>) -> Result<Vec<ProjectSummary>, String> {
    let root = current_root(&state)?;
    workspace::list_projects(&root).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(
    state: State<AppState>,
    name: String,
    client: String,
    project_type: String,
) -> Result<ProjectSummary, String> {
    let root = current_root(&state)?;
    let (id, meta) = workspace::create_project(&root, &name, &client, &project_type)
        .map_err(|e| e.to_string())?;
    Ok(ProjectSummary {
        id,
        name: meta.name,
        client: meta.client,
        project_type: meta.project_type,
        end_date: meta.end_date,
        finding_count: 0,
    })
}

/// Crea un proyecto de ejemplo completo (secciones + hallazgos demo).
#[tauri::command]
fn create_example_project(state: State<AppState>) -> Result<ProjectSummary, String> {
    let root = current_root(&state)?;
    let (id, meta) = workspace::create_example_project(&root).map_err(|e| e.to_string())?;
    let finding_count = workspace::list_findings(&root, &id)
        .map(|f| f.len())
        .unwrap_or(0);
    Ok(ProjectSummary {
        id,
        name: meta.name,
        client: meta.client,
        project_type: meta.project_type,
        end_date: meta.end_date,
        finding_count,
    })
}

#[tauri::command]
fn load_project(state: State<AppState>, id: String) -> Result<ProjectMeta, String> {
    let root = current_root(&state)?;
    workspace::read_project_meta(&root, &id).map_err(|e| e.to_string())
}

/// Borra un proyecto completo. Reindexa para quitar sus hallazgos del indice.
#[tauri::command]
fn delete_project(state: State<AppState>, id: String) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::delete_project(&root, &id).map_err(|e| e.to_string())?;
    let _ = db::reindex(&root);
    Ok(())
}

#[tauri::command]
fn save_project(state: State<AppState>, id: String, meta: ProjectMeta) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::write_project_meta(&root, &id, &meta).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Hallazgos
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_findings(state: State<AppState>, project_id: String) -> Result<Vec<Finding>, String> {
    let root = current_root(&state)?;
    workspace::list_findings(&root, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_finding(
    state: State<AppState>,
    project_id: String,
    finding_id: String,
) -> Result<Finding, String> {
    let root = current_root(&state)?;
    workspace::load_finding(&root, &project_id, &finding_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_finding(
    state: State<AppState>,
    project_id: String,
    title: String,
) -> Result<Finding, String> {
    let root = current_root(&state)?;
    workspace::create_finding(&root, &project_id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_finding(
    state: State<AppState>,
    project_id: String,
    finding: Finding,
) -> Result<Finding, String> {
    let root = current_root(&state)?;
    workspace::write_finding(&root, &project_id, &finding).map_err(|e| e.to_string())?;
    Ok(finding)
}

#[tauri::command]
fn delete_finding(
    state: State<AppState>,
    project_id: String,
    finding_id: String,
) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::delete_finding(&root, &project_id, &finding_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_findings(
    state: State<AppState>,
    project_id: String,
    order: Vec<String>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::reorder_findings(&root, &project_id, order).map_err(|e| e.to_string())
}

/// Busca hallazgos por titulo o cuerpo en todo el workspace.
/// Reindexa antes de consultar para devolver resultados frescos.
#[tauri::command]
fn search_findings(state: State<AppState>, query: String) -> Result<Vec<db::SearchHit>, String> {
    let root = current_root(&state)?;
    db::reindex(&root).map_err(|e| e.to_string())?;
    db::search(&root, &query).map_err(|e| e.to_string())
}

/// Guarda un asset (evidencia) en assets/ del proyecto y devuelve su ruta
/// relativa. Los bytes llegan como base64 desde el frontend.
#[tauri::command]
fn save_asset(
    state: State<AppState>,
    project_id: String,
    ext: String,
    data_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let root = current_root(&state)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("base64 invalido: {e}"))?;
    workspace::save_asset(&root, &project_id, &ext, &bytes).map_err(|e| e.to_string())
}

/// Guarda un asset de marca (logo / fondo de portada) y devuelve su ruta.
#[tauri::command]
fn save_branding_asset(
    state: State<AppState>,
    ext: String,
    data_base64: String,
) -> Result<String, String> {
    use base64::Engine;
    let root = current_root(&state)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("base64 invalido: {e}"))?;
    workspace::save_branding_asset(&root, &ext, &bytes).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// CVSS
// ---------------------------------------------------------------------------

#[tauri::command]
fn calc_cvss(version: CvssVersion, vector: String) -> Result<CvssResult, String> {
    cvss::calc(version, &vector).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Libreria de plantillas
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_finding_templates(state: State<AppState>) -> Result<Vec<FindingTemplate>, String> {
    let root = current_root(&state)?;
    workspace::list_finding_templates(&root).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_finding_template(state: State<AppState>, template: FindingTemplate) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::save_finding_template(&root, &template).map_err(|e| e.to_string())
}

#[tauri::command]
fn instantiate_template(
    state: State<AppState>,
    project_id: String,
    template_id: String,
    vars: std::collections::HashMap<String, String>,
) -> Result<Finding, String> {
    let root = current_root(&state)?;
    workspace::instantiate_template(&root, &project_id, &template_id, &vars)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_snippets(state: State<AppState>) -> Result<Vec<Snippet>, String> {
    let root = current_root(&state)?;
    workspace::list_snippets(&root).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_snippet(state: State<AppState>, snippet: Snippet) -> Result<(), String> {
    let root = current_root(&state)?;
    workspace::save_snippet(&root, &snippet).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_pdf_templates(app: AppHandle, state: State<AppState>) -> Result<Vec<PdfTemplate>, String> {
    let mut out = Vec::new();

    // Plantillas base empaquetadas.
    let base = templates_dir(&app);
    collect_typ(&base, true, &mut out);

    // Plantillas del usuario en el workspace.
    if let Ok(root) = current_root(&state) {
        collect_typ(&root.join("library/templates"), false, &mut out);
    }
    Ok(out)
}

/// Metadata opcional de una plantilla (templates/<name>.meta.yaml).
#[derive(Default, serde::Deserialize, serde::Serialize)]
struct TemplateMeta {
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    tags: Vec<String>,
}

/// Familia de render derivada de los tags: un solo concepto, el tag manda. El
/// tag "retest" arma el reporte como retest; "narrative" lo deja sin tabla de
/// hallazgos; sin tag especial es "findings".
fn derive_family_from_tags(tags: &[String]) -> String {
    if tags.iter().any(|t| t == "retest") {
        "retest".to_string()
    } else if tags.iter().any(|t| t == "narrative") {
        "narrative".to_string()
    } else {
        "findings".to_string()
    }
}

fn collect_typ(dir: &std::path::Path, builtin: bool, out: &mut Vec<PdfTemplate>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "typ") {
                if let Some(stem) = path.file_stem() {
                    let name = stem.to_string_lossy().to_string();
                    // Metadata sidecar opcional.
                    let meta: TemplateMeta =
                        std::fs::read_to_string(dir.join(format!("{name}.meta.yaml")))
                            .ok()
                            .and_then(|c| serde_yaml::from_str(&c).ok())
                            .unwrap_or_default();
                    let family = derive_family_from_tags(&meta.tags);
                    out.push(PdfTemplate {
                        title: if meta.title.is_empty() {
                            name.clone()
                        } else {
                            meta.title
                        },
                        description: if meta.description.is_empty() {
                            first_comment(&path)
                        } else {
                            meta.description
                        },
                        tags: meta.tags,
                        family,
                        name,
                        builtin,
                    });
                }
            }
        }
    }
}

/// Directorio de plantillas del usuario dentro del workspace.
fn user_templates_dir(root: &std::path::Path) -> std::path::PathBuf {
    root.join("library/templates")
}

/// Valida el nombre de una plantilla .typ contra path traversal (mismo criterio
/// que validate_id de core: sin separadores ni `..`).
fn validate_template_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("nombre de plantilla invalido: {name}"));
    }
    Ok(())
}

/// Canonicaliza `path` y verifica que quede dentro del workspace abierto. Evita
/// que el webview abra o revele rutas arbitrarias del sistema con el opener.
fn ensure_within_workspace(
    state: &State<AppState>,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    let root = current_root(state)?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if target.starts_with(&root) {
        Ok(target)
    } else {
        Err("la ruta esta fuera del workspace".to_string())
    }
}

/// Duplica una plantilla (builtin o de la libreria) a la libreria del usuario
/// para poder editarla. Devuelve el nuevo nombre.
#[tauri::command]
fn duplicate_template(
    app: AppHandle,
    state: State<AppState>,
    name: String,
) -> Result<String, String> {
    validate_template_name(&name)?;
    let root = current_root(&state)?;
    // Buscar el origen: primero libreria del usuario, luego builtin.
    let src = {
        let user = user_templates_dir(&root).join(format!("{name}.typ"));
        if user.exists() {
            user
        } else {
            templates_dir(&app).join(format!("{name}.typ"))
        }
    };
    if !src.exists() {
        return Err(format!("plantilla no encontrada: {name}"));
    }
    let dir = user_templates_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Nombre unico: <name>-copia, -copia-2, ...
    let mut new_name = format!("{name}-copia");
    let mut n = 2;
    while dir.join(format!("{new_name}.typ")).exists() {
        new_name = format!("{name}-copia-{n}");
        n += 1;
    }
    std::fs::copy(&src, dir.join(format!("{new_name}.typ"))).map_err(|e| e.to_string())?;
    // Copiar metadata si existe (junto al origen).
    if let Some(src_dir) = src.parent() {
        let meta_src = src_dir.join(format!("{name}.meta.yaml"));
        if meta_src.exists() {
            let _ = std::fs::copy(meta_src, dir.join(format!("{new_name}.meta.yaml")));
        }
    }
    Ok(new_name)
}

/// Lee el codigo fuente .typ de una plantilla (para editarla).
#[tauri::command]
fn read_template_source(
    app: AppHandle,
    state: State<AppState>,
    name: String,
) -> Result<String, String> {
    validate_template_name(&name)?;
    let root = current_root(&state)?;
    let user = user_templates_dir(&root).join(format!("{name}.typ"));
    let path = if user.exists() {
        user
    } else {
        templates_dir(&app).join(format!("{name}.typ"))
    };
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Guarda el codigo fuente .typ en la libreria del usuario.
#[tauri::command]
fn save_template_source(
    state: State<AppState>,
    name: String,
    content: String,
) -> Result<(), String> {
    validate_template_name(&name)?;
    let root = current_root(&state)?;
    let dir = user_templates_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{name}.typ")), content).map_err(|e| e.to_string())
}

/// Elimina una plantilla de la libreria del usuario (.typ y su .meta.yaml).
/// Nunca toca las incluidas: solo opera dentro de library/templates del
/// workspace, asi que las base empaquetadas no se pueden borrar.
#[tauri::command]
fn delete_template(state: State<AppState>, name: String) -> Result<(), String> {
    validate_template_name(&name)?;
    let root = current_root(&state)?;
    let dir = user_templates_dir(&root);
    let typ = dir.join(format!("{name}.typ"));
    if !typ.exists() {
        return Err(format!("plantilla no encontrada en tu libreria: {name}"));
    }
    std::fs::remove_file(&typ).map_err(|e| e.to_string())?;
    let meta = dir.join(format!("{name}.meta.yaml"));
    if meta.exists() {
        let _ = std::fs::remove_file(meta);
    }
    // Limpia el override en TODO proyecto que la usara, para no dejar una
    // referencia colgante que rompa la generacion del PDF.
    if let Ok(projects) = workspace::list_projects(&root) {
        for p in projects {
            if let Ok(mut meta) = workspace::read_project_meta(&root, &p.id) {
                if meta.template_override == name {
                    meta.template_override = String::new();
                    let _ = workspace::write_project_meta(&root, &p.id, &meta);
                }
            }
        }
    }
    Ok(())
}

/// Guarda la metadata (.meta.yaml) de una plantilla en la libreria del usuario:
/// titulo, descripcion y tags. Los tags definen la familia de render (p.ej.
/// "retest" activa el orden por estado). Solo escribe en la libreria del usuario.
#[tauri::command]
fn save_template_meta(
    state: State<AppState>,
    name: String,
    title: String,
    description: String,
    tags: Vec<String>,
) -> Result<(), String> {
    validate_template_name(&name)?;
    let root = current_root(&state)?;
    let dir = user_templates_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let meta = TemplateMeta {
        title,
        description,
        tags,
    };
    let yaml = serde_yaml::to_string(&meta).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{name}.meta.yaml")), yaml).map_err(|e| e.to_string())
}

/// Primer comentario (`// ...`) no vacio del archivo, como descripcion.
fn first_comment(path: &std::path::Path) -> String {
    let Ok(content) = std::fs::read_to_string(path) else {
        return String::new();
    };
    for line in content.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("//") {
            let d = rest.trim();
            if !d.is_empty() {
                return d.to_string();
            }
        } else if !t.is_empty() {
            break;
        }
    }
    String::new()
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

#[tauri::command]
async fn generate_pdf(
    app: AppHandle,
    project_id: String,
    also_executive: bool,
) -> Result<Vec<String>, String> {
    // Resolver datos fuera del hilo bloqueante.
    let root = {
        let state = app.state::<AppState>();
        current_root(&state)?
    };
    let templates = templates_dir(&app);
    let typst_bin = pdf::resolve_typst().map_err(|e| e.to_string())?;

    // La compilacion es bloqueante: ejecutarla en un hilo aparte.
    let paths = tauri::async_runtime::spawn_blocking(move || {
        pdf::generate_pdf(&root, &project_id, &templates, &typst_bin, also_executive)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Renderiza el PDF a imagenes PNG (data URLs) para la vista previa embebida.
#[tauri::command]
async fn preview_pdf(app: AppHandle, project_id: String) -> Result<Vec<String>, String> {
    let root = {
        let state = app.state::<AppState>();
        current_root(&state)?
    };
    let templates = templates_dir(&app);
    let typst_bin = pdf::resolve_typst().map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        pdf::preview_pdf(&root, &project_id, &templates, &typst_bin)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Abre un archivo con la aplicacion por defecto del sistema (ej. el PDF).
/// Solo se permiten rutas dentro del workspace abierto.
#[tauri::command]
fn open_path(state: State<AppState>, path: String) -> Result<(), String> {
    let target = ensure_within_workspace(&state, &path)?;
    opener::open(&target).map_err(|e| e.to_string())
}

/// Abre el explorador de archivos mostrando el archivo (revela la carpeta).
/// Solo se permiten rutas dentro del workspace abierto.
#[tauri::command]
fn reveal_path(state: State<AppState>, path: String) -> Result<(), String> {
    let target = ensure_within_workspace(&state, &path)?;
    opener::reveal(&target).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

#[tauri::command]
fn git_init(state: State<AppState>) -> Result<(), String> {
    let root = current_root(&state)?;
    git::init(&root).map_err(|e| e.to_string())
}

#[tauri::command]
fn git_commit(state: State<AppState>, message: String) -> Result<(), String> {
    let root = current_root(&state)?;
    git::commit(&root, &message).map_err(|e| e.to_string())
}

/// Estado git (cambios sin commitear) de un proyecto.
#[tauri::command]
fn git_status(state: State<AppState>, project_id: String) -> Result<git::GitState, String> {
    let root = current_root(&state)?;
    git::status(&root, &project_id).map_err(|e| e.to_string())
}

/// Historial de commits que tocan un proyecto (mas reciente primero).
#[tauri::command]
fn git_log(state: State<AppState>, project_id: String) -> Result<Vec<git::GitCommit>, String> {
    let root = current_root(&state)?;
    git::log(&root, &project_id, 50).map_err(|e| e.to_string())
}

/// Estado de la integracion con un cliente MCP ("desktop" | "code").
#[tauri::command]
fn mcp_status(state: State<AppState>, client: String) -> Result<mcp::McpStatus, String> {
    let root = current_root(&state)?;
    mcp::status(mcp::McpClient::parse(&client)?, &root)
}

/// Conecta el workspace abierto al cliente MCP indicado.
#[tauri::command]
fn mcp_connect(state: State<AppState>, client: String) -> Result<(), String> {
    let root = current_root(&state)?;
    mcp::connect(mcp::McpClient::parse(&client)?, &root)
}

/// Desconecta: quita la entrada de PuduReport del cliente MCP indicado.
#[tauri::command]
fn mcp_disconnect(client: String) -> Result<(), String> {
    mcp::disconnect(mcp::McpClient::parse(&client)?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pick_workspace,
            get_stored_workspace,
            list_recent_workspaces,
            remove_recent_workspace,
            open_workspace,
            create_workspace,
            save_workspace_meta,
            workspace_stats,
            list_projects,
            create_project,
            create_example_project,
            load_project,
            delete_project,
            save_project,
            list_findings,
            load_finding,
            create_finding,
            save_finding,
            delete_finding,
            reorder_findings,
            save_asset,
            save_branding_asset,
            search_findings,
            calc_cvss,
            list_finding_templates,
            save_finding_template,
            instantiate_template,
            list_snippets,
            save_snippet,
            list_pdf_templates,
            duplicate_template,
            read_template_source,
            save_template_source,
            save_template_meta,
            delete_template,
            generate_pdf,
            preview_pdf,
            open_path,
            reveal_path,
            git_init,
            git_commit,
            git_status,
            git_log,
            mcp_status,
            mcp_connect,
            mcp_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicacion Tauri");
}
