// Wrapper tipado de toda la comunicacion IPC con el backend Rust.
// Regla de README.dev.md: ningun componente llama a invoke() directamente.
import { invoke } from "@tauri-apps/api/core";
import type {
  CvssResult,
  CvssVersion,
  Finding,
  FindingTemplate,
  PdfTemplate,
  ProjectMeta,
  ProjectSummary,
  Snippet,
  WorkspaceMeta,
} from "./types";

// --- Workspace ---

/** Abre el file picker para elegir/crear la carpeta del workspace. */
export function pickWorkspace(): Promise<string | null> {
  return invoke("pick_workspace");
}

/** Ruta del ultimo workspace abierto (persistida en tauri-plugin-store). */
export function getStoredWorkspace(): Promise<string | null> {
  return invoke("get_stored_workspace");
}

/** Abre un workspace existente en la ruta dada. */
export function openWorkspace(path: string): Promise<WorkspaceMeta> {
  return invoke("open_workspace", { path });
}

/** Crea un workspace nuevo (estructura inicial) en la ruta dada. */
export function createWorkspace(path: string, name: string): Promise<WorkspaceMeta> {
  return invoke("create_workspace", { path, name });
}

export function saveWorkspaceMeta(meta: WorkspaceMeta): Promise<void> {
  return invoke("save_workspace_meta", { meta });
}

// --- Proyectos ---

export function listProjects(): Promise<ProjectSummary[]> {
  return invoke("list_projects");
}

export function createProject(name: string, client: string): Promise<ProjectSummary> {
  return invoke("create_project", { name, client });
}

/** Crea un proyecto de ejemplo completo (secciones + hallazgos demo). */
export function createExampleProject(): Promise<ProjectSummary> {
  return invoke("create_example_project");
}

export function loadProject(id: string): Promise<ProjectMeta> {
  return invoke("load_project", { id });
}

export function saveProject(id: string, meta: ProjectMeta): Promise<void> {
  return invoke("save_project", { id, meta });
}

// --- Hallazgos ---

export function listFindings(projectId: string): Promise<Finding[]> {
  return invoke("list_findings", { projectId });
}

export function loadFinding(projectId: string, findingId: string): Promise<Finding> {
  return invoke("load_finding", { projectId, findingId });
}

/** Guarda un hallazgo. Devuelve el hallazgo (el id puede cambiar si el slug cambio). */
export function saveFinding(projectId: string, finding: Finding): Promise<Finding> {
  return invoke("save_finding", { projectId, finding });
}

export function createFinding(projectId: string, title: string): Promise<Finding> {
  return invoke("create_finding", { projectId, title });
}

export function deleteFinding(projectId: string, findingId: string): Promise<void> {
  return invoke("delete_finding", { projectId, findingId });
}

export function reorderFindings(projectId: string, order: string[]): Promise<void> {
  return invoke("reorder_findings", { projectId, order });
}

/** Guarda un asset (evidencia) y devuelve su ruta relativa (assets/<uuid>.<ext>). */
export function saveAsset(projectId: string, ext: string, dataBase64: string): Promise<string> {
  return invoke("save_asset", { projectId, ext, dataBase64 });
}

// --- CVSS ---

/** Calcula puntaje y severidad a partir de un vector CVSS 3.1 o 4.0. */
export function calcCvss(version: CvssVersion, vector: string): Promise<CvssResult> {
  return invoke("calc_cvss", { version, vector });
}

// --- Libreria de plantillas ---

export function listFindingTemplates(): Promise<FindingTemplate[]> {
  return invoke("list_finding_templates");
}

export function saveFindingTemplate(template: FindingTemplate): Promise<void> {
  return invoke("save_finding_template", { template });
}

/** Clona una plantilla de hallazgo a un proyecto, reemplazando variables. */
export function instantiateTemplate(
  projectId: string,
  templateId: string,
  vars: Record<string, string>,
): Promise<Finding> {
  return invoke("instantiate_template", { projectId, templateId, vars });
}

export function listSnippets(): Promise<Snippet[]> {
  return invoke("list_snippets");
}

export function saveSnippet(snippet: Snippet): Promise<void> {
  return invoke("save_snippet", { snippet });
}

export function listPdfTemplates(): Promise<PdfTemplate[]> {
  return invoke("list_pdf_templates");
}

// --- PDF ---

/** Compila el PDF del proyecto y devuelve la ruta del archivo generado. */
export function generatePdf(projectId: string): Promise<string> {
  return invoke("generate_pdf", { projectId });
}

/** Renderiza el PDF a imagenes PNG (data URLs) para la vista previa embebida. */
export function previewPdf(projectId: string): Promise<string[]> {
  return invoke("preview_pdf", { projectId });
}

// --- Git ---

export function gitInit(): Promise<void> {
  return invoke("git_init");
}

export function gitCommit(message: string): Promise<void> {
  return invoke("git_commit", { message });
}
