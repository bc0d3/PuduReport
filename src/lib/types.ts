// Contrato de datos compartido con el backend Rust (serde).
// Cualquier cambio aqui debe reflejarse en src-tauri/src/workspace.rs.
// Regla de oro: los archivos en disco son la fuente de verdad; estos tipos
// describen lo que el backend lee/escribe en esos archivos.

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type CvssVersion = "3.1" | "4.0";

export type FindingStatus = "open" | "fixed" | "accepted" | "wontfix";

/** Front-matter estructurado de un hallazgo (findings/*.md). */
export interface FindingMeta {
  title: string;
  /** Derivada del vector CVSS, no editable a mano. */
  severity: Severity;
  cvss_version: CvssVersion;
  /** Puntaje numerico como string, ej "8.1". Vacio si no hay vector. */
  cvss: string;
  cvss_vector: string;
  cwe: string;
  status: FindingStatus;
  affected: string[];
}

/** Hallazgo completo: front-matter + cuerpo markdown. */
export interface Finding {
  /** Identificador estable: nombre de archivo sin extension, ej "001-sqli-login". */
  id: string;
  meta: FindingMeta;
  /** Cuerpo markdown libre (Descripcion/Impacto/PoC/Remediacion). */
  body: string;
}

/** Bloque de seccion del reporte (resumen, alcance, metodologia, conclusiones). */
export interface ReportSection {
  key: string;
  title: string;
  /** Contenido markdown del bloque. */
  body: string;
  /** Si la seccion se incluye en el PDF. */
  enabled: boolean;
}

export interface TeamMember {
  name: string;
  role: string;
}

/** project.yaml */
export interface ProjectMeta {
  name: string;
  client: string;
  /** Tipo de proyecto: define formulario, scaffold y plantilla por defecto. */
  project_type: string;
  /** OSID del candidato (tipos de examen). Portada y nombre del PDF. */
  osid: string;
  /** Plantilla .typ a usar en vez de la del tipo. Vacio = la del tipo. */
  template_override: string;
  /** Fechas ISO (YYYY-MM-DD). */
  start_date: string;
  end_date: string;
  scope: string[];
  team: TeamMember[];
  /** Secciones de prosa del reporte, en orden. */
  sections: ReportSection[];
  /** Orden de los hallazgos en el PDF (ids). Drag & drop reescribe este array. */
  finding_order: string[];
}

export interface Watermark {
  enabled: boolean;
  text: string;
  /** 0.0 - 1.0 */
  opacity: number;
  /** Tamano de fuente en puntos. */
  size: number;
}

export interface Branding {
  logo_path: string;
  /** Imagen de fondo de portada (ruta root-relative); vacio = color de marca. */
  cover_background: string;
  primary_color: string;
  /** Disposicion de portada. */
  cover_layout: "centered" | "sidebar" | "full-bleed" | "minimal";
  /** Opacidad de la capa oscura sobre la imagen de fondo (0.0 - 1.0). */
  cover_scrim: number;
  /** Cada hallazgo en su propia pagina. */
  findings_page_break: boolean;
}

/** workspace.yaml. Solo identidad visual; la plantilla y el tipo viven en el proyecto. */
export interface WorkspaceMeta {
  name: string;
  branding: Branding;
  watermark: Watermark;
}

/** Un archivo con cambios sin commitear (relativo al workspace). */
export interface GitChange {
  path: string;
  /** "new" | "modified" | "deleted" | "renamed". */
  status: string;
}

/** Estado git del proyecto. */
export interface GitState {
  initialized: boolean;
  changes: GitChange[];
}

/** Un commit del historial. */
export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  /** Segundos Unix. */
  timestamp: number;
}

/** Workspace reciente para la pantalla de bienvenida. */
export interface RecentWorkspace {
  path: string;
  name: string;
  /** Si la carpeta sigue existiendo (tiene workspace.yaml). */
  exists: boolean;
}

/** Resumen liviano de un proyecto para listados (no carga hallazgos). */
export interface ProjectSummary {
  id: string;
  name: string;
  client: string;
  project_type: string;
  end_date: string;
  finding_count: number;
}

/** Hallazgo reutilizable de la libreria (con variables {{cliente}}, {{target}}). */
export interface FindingTemplate {
  id: string;
  meta: FindingMeta;
  body: string;
}

/** Snippet de texto reutilizable. */
export interface Snippet {
  id: string;
  title: string;
  body: string;
}

/** Plantilla de PDF (.typ) disponible. */
export interface PdfTemplate {
  /** Nombre de archivo sin extension (id). */
  name: string;
  /** Si es de la libreria base (versionada) o del workspace del usuario. */
  builtin: boolean;
  /** Titulo legible. */
  title: string;
  /** Descripcion corta. */
  description: string;
  /** Tags para filtrar (red-team, perimetral, web, oscp, htb...). */
  tags: string[];
}

export interface CvssResult {
  score: number;
  severity: Severity;
  vector: string;
}
