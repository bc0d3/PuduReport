// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

// Parte ejecutiva del informe (ethical hacking): opciones de las listas
// cerradas y helpers puros que comparten el editor de hallazgos y Reporte.
// Espeja las reglas de core/src/models.rs; el backend vuelve a validar todo al
// guardar, asi que esto solo evita ofrecer valores que se descartarian.

import type {
  AccionRemediacion,
  CategoriaRiesgo,
  CausaRaiz,
  Finding,
  PrioridadRemediacion,
} from "./types";

/** Largo maximo del impacto para el negocio (caracteres). */
export const IMPACTO_NEGOCIO_MAX = 500;
/** Largo maximo del modulo afectado (caracteres). */
export const MODULO_MAX = 120;
/** Largo maximo de los textos cortos (titulo de causa raiz, responsable). */
export const TEXTO_CORTO_MAX = 120;
/** Largo maximo de los textos largos (descripcion de causa raiz, accion). */
export const TEXTO_LARGO_MAX = 1000;

export const CATEGORIA_RIESGO_OPTIONS: { value: CategoriaRiesgo; label: string }[] = [
  { value: "", label: "Sin especificar" },
  { value: "fuga_datos", label: "Fuga de datos personales" },
  { value: "fraude_economico", label: "Fraude economico" },
  { value: "interrupcion_servicio", label: "Interrupcion del servicio" },
  { value: "incumplimiento_regulatorio", label: "Incumplimiento regulatorio" },
  { value: "reputacional", label: "Reputacional" },
  { value: "reconocimiento", label: "Reconocimiento y persistencia" },
];

export const PRIORIDAD_OPTIONS: { value: PrioridadRemediacion; label: string }[] = [
  { value: "", label: "Sin especificar" },
  { value: "inmediata", label: "Inmediata" },
  { value: "corto", label: "Corto plazo" },
  { value: "mediano", label: "Mediano plazo" },
  { value: "cierre", label: "Cierre" },
];

/**
 * Texto de un solo parrafo: reemplaza los saltos de linea por espacios y corta
 * en `max` caracteres (puntos de codigo, igual que el backend). No recorta
 * espacios para no mover el cursor mientras se escribe.
 */
export function singleParagraph(value: string, max: number): string {
  return Array.from(value.replace(/\r\n|\r|\n/g, " "))
    .slice(0, max)
    .join("");
}

/** Cantidad de caracteres como los cuenta el backend (puntos de codigo). */
export function charCount(value: string): number {
  return Array.from(value).length;
}

/**
 * Clave nueva para una causa raiz: "causa-N" con el primer N libre. Es estable
 * (no depende del titulo), asi editar el titulo no rompe las referencias.
 */
export function nextRootCauseKey(causas: CausaRaiz[]): string {
  const used = new Set(causas.map((c) => c.clave));
  let n = causas.length + 1;
  while (used.has(`causa-${n}`)) n++;
  return `causa-${n}`;
}

/** Causa raiz vacia lista para editar. */
export function newRootCause(causas: CausaRaiz[]): CausaRaiz {
  return { clave: nextRootCauseKey(causas), titulo: "", descripcion: "" };
}

/** Accion vacia del plan de remediacion. */
export function newRemediationAction(): AccionRemediacion {
  return { prioridad: "inmediata", accion: "", hallazgos: [], responsable: "" };
}

/**
 * Numero de cada hallazgo en el reporte (1-based, sin contar los ocultos), el
 * mismo que muestran el indice y el detalle del PDF. `findings` va en el orden
 * del reporte (como lo devuelve listFindings).
 */
export function findingNumbers(findings: Finding[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const f of findings) {
    if (!f.meta.hidden) numbers.set(f.id, numbers.size + 1);
  }
  return numbers;
}

/**
 * Agrega o quita un hallazgo de una accion. El resultado sigue el orden del
 * reporte (`order`) para que la lista guardada sea estable.
 */
export function toggleFindingId(selected: string[], id: string, order: string[]): string[] {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  const known = order.filter((x) => next.has(x));
  const unknown = [...next].filter((x) => !order.includes(x));
  return [...known, ...unknown];
}
