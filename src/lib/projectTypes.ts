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
