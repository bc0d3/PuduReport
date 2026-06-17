// Definiciones de metricas CVSS para la UI de la calculadora.
// El calculo del puntaje lo hace el backend Rust (comando calc_cvss); aqui solo
// se arma el vector a partir de las selecciones del usuario.
import type { CvssVersion } from "./types";

export interface MetricOption {
  value: string;
  label: string;
}

export interface MetricDef {
  key: string;
  name: string;
  options: MetricOption[];
  default: string;
}

export interface MetricGroup {
  title: string;
  metrics: MetricDef[];
}

const m = (key: string, name: string, options: MetricOption[]): MetricDef => ({
  key,
  name,
  options,
  default: options[0].value,
});

// --- CVSS 3.1 (metricas base) ---
export const CVSS31_GROUPS: MetricGroup[] = [
  {
    title: "Explotabilidad",
    metrics: [
      m("AV", "Vector de ataque (AV)", [
        { value: "N", label: "Red" },
        { value: "A", label: "Adyacente" },
        { value: "L", label: "Local" },
        { value: "P", label: "Fisico" },
      ]),
      m("AC", "Complejidad (AC)", [
        { value: "L", label: "Baja" },
        { value: "H", label: "Alta" },
      ]),
      m("PR", "Privilegios (PR)", [
        { value: "N", label: "Ninguno" },
        { value: "L", label: "Bajos" },
        { value: "H", label: "Altos" },
      ]),
      m("UI", "Interaccion (UI)", [
        { value: "N", label: "Ninguna" },
        { value: "R", label: "Requerida" },
      ]),
    ],
  },
  {
    title: "Alcance e impacto",
    metrics: [
      m("S", "Alcance (S)", [
        { value: "U", label: "Sin cambio" },
        { value: "C", label: "Cambiado" },
      ]),
      m("C", "Confidencialidad (C)", [
        { value: "N", label: "Ninguno" },
        { value: "L", label: "Bajo" },
        { value: "H", label: "Alto" },
      ]),
      m("I", "Integridad (I)", [
        { value: "N", label: "Ninguno" },
        { value: "L", label: "Bajo" },
        { value: "H", label: "Alto" },
      ]),
      m("A", "Disponibilidad (A)", [
        { value: "N", label: "Ninguno" },
        { value: "L", label: "Bajo" },
        { value: "H", label: "Alto" },
      ]),
    ],
  },
];

// --- CVSS 4.0 (metricas base) ---
export const CVSS40_GROUPS: MetricGroup[] = [
  {
    title: "Explotabilidad",
    metrics: [
      m("AV", "Vector de ataque (AV)", [
        { value: "N", label: "Red" },
        { value: "A", label: "Adyacente" },
        { value: "L", label: "Local" },
        { value: "P", label: "Fisico" },
      ]),
      m("AC", "Complejidad (AC)", [
        { value: "L", label: "Baja" },
        { value: "H", label: "Alta" },
      ]),
      m("AT", "Requisitos de ataque (AT)", [
        { value: "N", label: "Ninguno" },
        { value: "P", label: "Presente" },
      ]),
      m("PR", "Privilegios (PR)", [
        { value: "N", label: "Ninguno" },
        { value: "L", label: "Bajos" },
        { value: "H", label: "Altos" },
      ]),
      m("UI", "Interaccion (UI)", [
        { value: "N", label: "Ninguna" },
        { value: "P", label: "Pasiva" },
        { value: "A", label: "Activa" },
      ]),
    ],
  },
  {
    title: "Impacto en el sistema vulnerable",
    metrics: [
      m("VC", "Confidencialidad (VC)", impactOptions()),
      m("VI", "Integridad (VI)", impactOptions()),
      m("VA", "Disponibilidad (VA)", impactOptions()),
    ],
  },
  {
    title: "Impacto en sistemas subsecuentes",
    metrics: [
      m("SC", "Confidencialidad (SC)", impactOptions()),
      m("SI", "Integridad (SI)", impactOptions()),
      m("SA", "Disponibilidad (SA)", impactOptions()),
    ],
  },
];

function impactOptions(): MetricOption[] {
  return [
    { value: "H", label: "Alto" },
    { value: "L", label: "Bajo" },
    { value: "N", label: "Ninguno" },
  ];
}

/** Orden canonico de las metricas en el vector. */
const ORDER_31 = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"];
const ORDER_40 = ["AV", "AC", "AT", "PR", "UI", "VC", "VI", "VA", "SC", "SI", "SA"];

export function groupsFor(version: CvssVersion): MetricGroup[] {
  return version === "3.1" ? CVSS31_GROUPS : CVSS40_GROUPS;
}

/** Selecciones por defecto (todas las metricas en su primer valor). */
export function defaultSelections(version: CvssVersion): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const group of groupsFor(version)) {
    for (const metric of group.metrics) {
      sel[metric.key] = metric.default;
    }
  }
  return sel;
}

/** Arma el vector CVSS a partir de las selecciones. */
export function buildVector(version: CvssVersion, sel: Record<string, string>): string {
  const order = version === "3.1" ? ORDER_31 : ORDER_40;
  const prefix = version === "3.1" ? "CVSS:3.1" : "CVSS:4.0";
  const parts = order.map((key) => `${key}:${sel[key]}`);
  return [prefix, ...parts].join("/");
}

/** Parsea un vector existente a selecciones (para reabrir la calculadora). */
export function parseVector(version: CvssVersion, vector: string): Record<string, string> {
  const sel = defaultSelections(version);
  for (const part of vector.split("/")) {
    const [key, value] = part.split(":");
    if (key && value && key !== "CVSS" && key in sel) {
      sel[key] = value;
    }
  }
  return sel;
}
