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
}

export interface Branding {
  logo_path: string;
  primary_color: string;
  /** Disposicion de portada. */
  cover_layout: "centered" | "sidebar" | "full-bleed" | "minimal";
}

/** workspace.yaml */
export interface WorkspaceMeta {
  name: string;
  branding: Branding;
  watermark: Watermark;
  /** Plantilla .typ activa (nombre de archivo sin extension). */
  active_template: string;
}

/** Resumen liviano de un proyecto para listados (no carga hallazgos). */
export interface ProjectSummary {
  id: string;
  name: string;
  client: string;
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
  /** Nombre de archivo sin extension. */
  name: string;
  /** Si es de la libreria base (versionada) o del workspace del usuario. */
  builtin: boolean;
}

export interface CvssResult {
  score: number;
  severity: Severity;
  vector: string;
}
