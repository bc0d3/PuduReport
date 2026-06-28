// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

// Wrapper tipado de toda la comunicacion IPC con el backend Rust.
// Regla de README.dev.md: ningun componente llama a invoke() directamente.
import { invoke } from "@tauri-apps/api/core";
import type {
  CvssResult,
  CvssVersion,
  Finding,
  FindingTemplate,
  GitBranch,
  GitChange,
  GitCommit,
  GitState,
  McpClient,
  McpStatus,
  PdfTemplate,
  ProjectMeta,
  ProjectSummary,
  WorkspaceStats,
  RecentWorkspace,
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

/** Workspaces recientes para la pantalla de bienvenida (mas reciente primero). */
export function listRecentWorkspaces(): Promise<RecentWorkspace[]> {
  return invoke("list_recent_workspaces");
}

/** Quita un workspace de recientes (no borra del disco). */
export function removeRecentWorkspace(path: string): Promise<void> {
  return invoke("remove_recent_workspace", { path });
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

/** Resumen del workspace para el dashboard de Inicio (totales + severidades). */
export function workspaceStats(): Promise<WorkspaceStats> {
  return invoke("workspace_stats");
}

export function listProjects(): Promise<ProjectSummary[]> {
  return invoke("list_projects");
}

export function createProject(
  name: string,
  client: string,
  projectType: string,
): Promise<ProjectSummary> {
  return invoke("create_project", { name, client, projectType });
}

/** Crea un proyecto de ejemplo completo (secciones + hallazgos demo). */
export function createExampleProject(): Promise<ProjectSummary> {
  return invoke("create_example_project");
}

export function loadProject(id: string): Promise<ProjectMeta> {
  return invoke("load_project", { id });
}

/** Borra un proyecto completo (carpeta y contenido). No se puede deshacer. */
export function deleteProject(id: string): Promise<void> {
  return invoke("delete_project", { id });
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

/** Guarda un asset de marca (logo / fondo de portada). Devuelve ruta root-relative. */
export function saveBrandingAsset(ext: string, dataBase64: string): Promise<string> {
  return invoke("save_branding_asset", { ext, dataBase64 });
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

/** Duplica una plantilla a la libreria del usuario. Devuelve el nuevo nombre. */
export function duplicateTemplate(name: string): Promise<string> {
  return invoke("duplicate_template", { name });
}

/** Lee el codigo fuente .typ de una plantilla. */
export function readTemplateSource(name: string): Promise<string> {
  return invoke("read_template_source", { name });
}

/** Guarda el codigo fuente .typ en la libreria del usuario. */
export function saveTemplateSource(name: string, content: string): Promise<void> {
  return invoke("save_template_source", { name, content });
}

/** Elimina una plantilla de la libreria del usuario (no las incluidas). */
export function deleteTemplate(name: string): Promise<void> {
  return invoke("delete_template", { name });
}

/** Guarda la metadata (.meta.yaml) de una plantilla: titulo, descripcion y tags. */
export function saveTemplateMeta(
  name: string,
  title: string,
  description: string,
  tags: string[],
): Promise<void> {
  return invoke("save_template_meta", { name, title, description, tags });
}

// --- PDF ---

/**
 * Compila el PDF del proyecto. Si alsoExecutive es true y la plantilla no es ya
 * la ejecutiva, genera ademas un segundo PDF ejecutivo. Devuelve las rutas
 * producidas (principal primero).
 */
export function generatePdf(projectId: string, alsoExecutive = false): Promise<string[]> {
  return invoke("generate_pdf", { projectId, alsoExecutive });
}

/** Exporta un resumen de hallazgos a CSV con las columnas elegidas. Devuelve la ruta. */
export function exportCsv(projectId: string, columns: string[]): Promise<string> {
  return invoke("export_csv", { projectId, columns });
}

/** Renderiza el PDF a imagenes PNG (data URLs) para la vista previa embebida. */
export function previewPdf(projectId: string): Promise<string[]> {
  return invoke("preview_pdf", { projectId });
}

/** Abre un archivo con la app por defecto del sistema. */
export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

/** Abre el explorador mostrando el archivo (revela la carpeta). */
export function revealPath(path: string): Promise<void> {
  return invoke("reveal_path", { path });
}

// --- Git ---

export function gitInit(): Promise<void> {
  return invoke("git_init");
}

export function gitCommit(message: string): Promise<void> {
  return invoke("git_commit", { message });
}

/** Cambios sin commitear de un proyecto. */
export function gitStatus(projectId: string): Promise<GitState> {
  return invoke("git_status", { projectId });
}

/** Historial de commits que tocan un proyecto. */
export function gitLog(projectId: string): Promise<GitCommit[]> {
  return invoke("git_log", { projectId });
}

/** Ramas locales del workspace (la actual marcada). */
export function gitBranches(): Promise<GitBranch[]> {
  return invoke("git_branches");
}

/** Archivos de un proyecto que cambia un commit (para el panel de detalle). */
export function gitCommitFiles(projectId: string, hash: string): Promise<GitChange[]> {
  return invoke("git_commit_files", { projectId, hash });
}

// --- Integracion MCP (Claude Desktop / Claude Code) ---

/** Estado de la integracion con un cliente MCP para el workspace abierto. */
export function mcpStatus(client: McpClient): Promise<McpStatus> {
  return invoke("mcp_status", { client });
}

/** Conecta el workspace abierto al cliente MCP indicado. */
export function mcpConnect(client: McpClient): Promise<void> {
  return invoke("mcp_connect", { client });
}

/** Desconecta: quita la entrada de PuduReport del cliente MCP indicado. */
export function mcpDisconnect(client: McpClient): Promise<void> {
  return invoke("mcp_disconnect", { client });
}
