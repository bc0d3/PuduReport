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
  /** Identificadores CWE del hallazgo (puede tener varios). */
  cwe: string[];
  status: FindingStatus;
  affected: string[];
  /** Oculta el hallazgo del PDF. Ausente o false = visible. */
  hidden?: boolean;
  /** Hallazgo nuevo detectado en un retest. Solo relevante en familia retest. */
  new_in_retest?: boolean;
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

/** Tipo de bloque del cuerpo del reporte. */
export type BlockKind =
  | "cover"
  | "info"
  | "toc"
  | "severity"
  | "findings_index"
  | "section"
  | "findings"
  | "text"
  | "pagebreak";

/**
 * Bloque del cuerpo: el reporte es una lista ordenada de bloques que la
 * plantilla recorre y renderiza segun el kind. Un bloque "section" referencia
 * una seccion por `config.key`; un bloque "text" lleva su contenido en
 * `config.title`/`config.body`.
 */
export interface ReportBlock {
  kind: BlockKind;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** project.yaml */
export interface ProjectMeta {
  name: string;
  client: string;
  /** Gerencia del cliente (opcional). Se muestra en la portada si no esta vacia. */
  gerencia: string;
  /** Area del cliente (opcional). Se muestra en la portada si no esta vacia. */
  area: string;
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
  /** Cuerpo del PDF como lista ordenada de bloques. El backend lo reconcilia. */
  layout: ReportBlock[];
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

/** Elemento del lienzo libre de portada (cover_layout = "canvas"). */
export interface CoverElement {
  kind: "logo" | "title" | "client" | "subtitle" | "period" | "text" | "image";
  /** Coordenadas y ancho normalizados 0..1 sobre el area A4 completa. */
  x: number;
  y: number;
  w: number;
  /** Tamano de fuente en pt (texto); 0/ausente = default por kind. */
  font_size?: number;
  align?: "left" | "center" | "right";
  /** Color hex; vacio = color por kind. */
  color?: string;
  weight?: "normal" | "bold";
  /** Contenido literal (solo kind "text"). */
  content?: string;
  /** Ruta root-relative del asset (solo kind "image"). */
  src?: string;
}

export interface Branding {
  logo_path: string;
  /** Imagen de fondo de portada (ruta root-relative); vacio = color de marca. */
  cover_background: string;
  primary_color: string;
  /** Color del titulo de la portada. Vacio = color del layout (acento del reporte). */
  cover_color: string;
  /** Disposicion de portada. */
  cover_layout: "centered" | "sidebar" | "full-bleed" | "minimal" | "canvas";
  /** Opacidad de la capa oscura sobre la imagen de fondo (0.0 - 1.0). */
  cover_scrim: number;
  /** Cada hallazgo en su propia pagina. */
  findings_page_break: boolean;
  /** Fuente del cuerpo del reporte. Vacio = la del sistema por defecto. */
  body_font: string;
  /** Fuente del codigo/vectores (monoespaciada). Vacio = la del sistema. */
  mono_font: string;
  /** Mostrar el logo en la portada (aunque haya logo cargado). */
  cover_show_logo: boolean;
  /** Subtitulo libre bajo el cliente en la portada. Vacio = no se muestra. */
  cover_subtitle: string;
  /** Mostrar la linea de periodo (fechas) en la portada. */
  cover_show_period: boolean;
  /** Mostrar la linea de gerencia/area en la portada. */
  cover_show_org: boolean;
  /** Mostrar la linea decorativa de acento en la portada. */
  cover_show_accent: boolean;
  /** Elementos del lienzo libre de portada (cover_layout = "canvas"). */
  cover_elements?: CoverElement[];
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
  /** Familia de render: define orden y render. La resuelve el backend. */
  family: "findings" | "retest" | "narrative";
}

export interface CvssResult {
  score: number;
  severity: Severity;
  vector: string;
}

/** Conteo de hallazgos por severidad. */
export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

/** Estadisticas de un proyecto para el dashboard. */
export interface ProjectStats {
  id: string;
  name: string;
  client: string;
  project_type: string;
  total: number;
  severity: SeverityCounts;
}

/** Resumen del workspace para el dashboard de Inicio. */
export interface WorkspaceStats {
  total_projects: number;
  total_findings: number;
  open_findings: number;
  severity: SeverityCounts;
  projects: ProjectStats[];
}

/** Cliente MCP soportado por la integracion. */
export type McpClient = "desktop" | "code";

/** Estado de la integracion con un cliente MCP. */
export interface McpStatus {
  /** El config del cliente ya tiene la entrada de PuduReport. */
  installed: boolean;
  /** La entrada apunta al workspace actualmente abierto. */
  points_to_current: boolean;
  /** Ruta del config del cliente. */
  config_path: string;
  /** Se encontro el binario pudureport-mcp junto a la app. */
  binary_found: boolean;
  /** Para Claude Code: se encontro el CLI `claude`. Desktop siempre true. */
  cli_available: boolean;
}
