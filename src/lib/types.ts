// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

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
  /** Campos ocultos en el PDF sin ocultar el hallazgo entero: "affected" y
   * las claves de FINDING_SECTIONS ("descripcion", "impacto", "poc",
   * "remediacion"). Ausente o vacio = todo visible. */
  hidden_fields?: string[];
  /** Impacto para el negocio: un parrafo de texto plano (hasta 500 caracteres). */
  impacto_negocio?: string;
  /** Categoria de riesgo para el negocio. Lista cerrada; ausente o "" = sin especificar. */
  categoria_riesgo?: CategoriaRiesgo;
  /** Modulo o componente afectado (hasta 120 caracteres). */
  modulo?: string;
  /** Clave de una causa raiz del proyecto. Ausente o "" = sin causa raiz. */
  causa_raiz?: string;
}

/** Categoria de riesgo para el negocio de un hallazgo. "" = sin especificar. */
export type CategoriaRiesgo =
  | ""
  | "fuga_datos"
  | "fraude_economico"
  | "interrupcion_servicio"
  | "incumplimiento_regulatorio"
  | "reputacional"
  | "reconocimiento";

/** Prioridad de una accion del plan de remediacion. "" = sin especificar. */
export type PrioridadRemediacion = "" | "inmediata" | "corto" | "mediano" | "cierre";

/** Causa raiz comun a varios hallazgos (parte ejecutiva del informe). */
export interface CausaRaiz {
  /** Slug estable que referencian los hallazgos; no cambia al editar el titulo. */
  clave: string;
  titulo: string;
  descripcion: string;
}

/** Accion del plan de remediacion priorizado. */
export interface AccionRemediacion {
  prioridad: PrioridadRemediacion;
  accion: string;
  /** Ids de los hallazgos que cierra. */
  hallazgos: string[];
  responsable: string;
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

/** Estado del proyecto en el tablero Kanban de la vista de Proyectos. */
export type ProjectStatus = "todo" | "inprogress" | "done" | "assigned";

/** Registro de asignacion de cierre de un proyecto (historial append-only). */
export interface ProjectAssignment {
  name: string;
  email: string;
  /** UTC ISO-8601, generado por el backend. */
  assigned_at: string;
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
  | "pagebreak"
  | "root_causes"
  | "business_risks"
  | "findings_impact"
  | "remediation_plan";

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

/** Ambiente evaluado de un proyecto. Lista cerrada; "" = sin especificar. */
export type Ambiente = "" | "qa" | "produccion";

/** Exposicion del activo evaluado. Lista cerrada; "" = sin especificar. */
export type Exposicion = "" | "internet" | "interno";

/** project.yaml */
export interface ProjectMeta {
  name: string;
  client: string;
  /** Gerencia del cliente (opcional). Se muestra en la portada si no esta vacia. */
  gerencia: string;
  /** Area del cliente (opcional). Se muestra en la portada si no esta vacia. */
  area: string;
  /**
   * Ambiente evaluado (opcional). Metadata para integraciones; no sale en el
   * PDF. "" = sin especificar.
   */
  ambiente: Ambiente;
  /**
   * Exposicion del activo evaluado (opcional). Metadata para integraciones (ej.
   * SLA segun exposicion); no sale en el PDF. "" = sin especificar.
   */
  exposicion: Exposicion;
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
  /** Etapa en el tablero Kanban de Proyectos. */
  project_status: ProjectStatus;
  /** Historial de asignaciones de cierre (append-only). */
  assignment_history: ProjectAssignment[];
  /** Secciones de prosa del reporte, en orden. */
  sections: ReportSection[];
  /** Cuerpo del PDF como lista ordenada de bloques. El backend lo reconcilia. */
  layout: ReportBlock[];
  /** Orden de los hallazgos en el PDF (ids). Drag & drop reescribe este array. */
  finding_order: string[];
  /** Causas raiz (parte ejecutiva). Ausente = ninguna. */
  causas_raiz?: CausaRaiz[];
  /** Plan de remediacion priorizado (parte ejecutiva). Ausente = vacio. */
  plan_remediacion?: AccionRemediacion[];
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
  /** Orden de las tarjetas del tablero Kanban de Proyectos (ids). */
  project_order: string[];
  /** Destinos de exportacion a API externa (opt-in, editables). */
  export_targets: ExportTarget[];
}

/**
 * Destino de exportacion a una API externa (opt-in, editable). El token NO
 * viaja en este objeto: vive en el keychain del SO y se maneja aparte
 * (setExportToken / hasExportToken).
 */
export interface ExportTarget {
  name: string;
  url: string;
  /** Campos de metadata a incluir por hallazgo (esquema estable). */
  fields: string[];
  /** Incluir el bloque de conteos por severidad. */
  include_summary: boolean;
  /**
   * Datos opcionales del proyecto a incluir en `project` ("environment",
   * "exposure"). Vacio = el payload de siempre.
   */
  project_fields: string[];
}

/** Resultado de un envio a la API externa. */
export interface ApiSendResult {
  status: number;
  ok: boolean;
  body: string;
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

/** Una rama local del workspace. */
export interface GitBranch {
  name: string;
  current: boolean;
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
  start_date: string;
  end_date: string;
  finding_count: number;
  project_status: ProjectStatus;
  assignment_history: ProjectAssignment[];
}

/** Hallazgo reutilizable de la libreria (con variables {{cliente}}, {{target}}). */
export interface FindingTemplate {
  id: string;
  meta: FindingMeta;
  body: string;
  /** Empaquetada con la app (solo lectura) vs guardada por el usuario. */
  builtin: boolean;
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
  /** La escribio/edito una IA via MCP, sin revision humana todavia. Se limpia
   * cuando un humano la guarda desde el editor de plantillas. */
  ai_generated?: boolean;
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
