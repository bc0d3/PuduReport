import type { Severity } from "./types";

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
  info: "var(--sev-info)",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  info: "Informativa",
};

/** Letra del badge compacto (inicial de la etiqueta en espaniol). */
export const SEVERITY_LETTER: Record<Severity, string> = {
  critical: "C",
  high: "A",
  medium: "M",
  low: "B",
  info: "I",
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
