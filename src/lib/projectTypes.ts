// Catalogo de tipos de proyecto. El tipo se elige al crear el proyecto y define
// el formulario (examen sin CVSS, tipos sin hallazgos), el scaffold de secciones
// (backend) y la plantilla por defecto. Espeja models::template_for_type.

export interface ProjectTypeInfo {
  value: string;
  label: string;
  icon: string;
  /** Descripcion corta para el selector. */
  desc: string;
  /** Plantilla .typ por defecto del tipo. */
  template: string;
  /** Si el reporte se centra en hallazgos (vulnerabilidades). */
  usesFindings: boolean;
  /** Si es un examen: severidad cualitativa manual, sin CVSS, y campo OSID. */
  exam: boolean;
}

export const PROJECT_TYPES: ProjectTypeInfo[] = [
  {
    value: "pentest",
    label: "Pentest (web / infra)",
    icon: "ti-bug",
    desc: "Reporte de hallazgos con CVSS, PoC y remediacion.",
    template: "pentest",
    usesFindings: true,
    exam: false,
  },
  {
    value: "redteam",
    label: "Red Team",
    icon: "ti-target",
    desc: "Narrativa de ataque con los hallazgos que la habilitaron.",
    template: "pentest",
    usesFindings: true,
    exam: false,
  },
  {
    value: "oscp",
    label: "Examen OSCP",
    icon: "ti-certificate",
    desc: "Por maquina, severidad cualitativa sin CVSS, OSID.",
    template: "oscp",
    usesFindings: true,
    exam: true,
  },
  {
    value: "htb",
    label: "Examen HTB",
    icon: "ti-certificate-2",
    desc: "Examen de Hack The Box.",
    template: "htb",
    usesFindings: true,
    exam: true,
  },
  {
    value: "ejecutivo",
    label: "Informe ejecutivo",
    icon: "ti-presentation",
    desc: "Solo prosa, no tecnico. Sin tabla de hallazgos.",
    template: "ejecutivo",
    usesFindings: false,
    exam: false,
  },
  {
    value: "documento",
    label: "Documento libre",
    icon: "ti-file-text",
    desc: "Secciones abiertas para documentar lo que sea.",
    template: "documento-libre",
    usesFindings: false,
    exam: false,
  },
  {
    value: "retest",
    label: "Retest / verificacion",
    icon: "ti-checkup-list",
    desc: "Estado de remediacion de hallazgos previos.",
    template: "retest",
    usesFindings: true,
    exam: false,
  },
];

const FALLBACK = PROJECT_TYPES[0];

/** Metadata del tipo; cae a pentest si el valor es desconocido. */
export function typeInfo(value: string | undefined): ProjectTypeInfo {
  return PROJECT_TYPES.find((t) => t.value === value) ?? FALLBACK;
}

/** Etiqueta legible del tipo. */
export function typeLabel(value: string | undefined): string {
  return typeInfo(value).label;
}

/** Plantilla efectiva del proyecto: el override, o la del tipo. */
export function effectiveTemplate(project: {
  project_type: string;
  template_override: string;
}): string {
  return project.template_override || typeInfo(project.project_type).template;
}

/** Tipos cuyo cuerpo es fijo (no editable por bloques). Solo el examen OSCP. */
const FIXED_BODY_TYPES = new Set(["oscp"]);

/** Plantillas .typ incluidas que recorren project.layout (cuerpo por bloques). */
const BLOCK_RENDERER_TEMPLATES = new Set([
  "pentest",
  "ejecutivo",
  "documento-libre",
  "retest",
  "htb",
]);

/**
 * Si el reporte usa el editor de bloques (cuerpo data-driven). Se gatea por TIPO
 * (no por la plantilla efectiva) para que el editor aparezca aunque el proyecto
 * tenga un override personalizado; el examen OSCP conserva su cuerpo fijo.
 */
export function usesBlockRenderer(project: {
  project_type: string;
  template_override: string;
}): boolean {
  return !FIXED_BODY_TYPES.has(project.project_type);
}

/**
 * Si el proyecto usa una plantilla personalizada (override) que NO es una de las
 * incluidas con renderer de bloques. En ese caso el editor de bloques se muestra,
 * pero el PDF puede no reflejar el orden si la copia es previa a esta version.
 */
export function usesCustomTemplate(project: {
  project_type: string;
  template_override: string;
}): boolean {
  return usesBlockRenderer(project) && !BLOCK_RENDERER_TEMPLATES.has(effectiveTemplate(project));
}
