// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

// Secciones del cuerpo de un hallazgo. El archivo en disco sigue siendo un
// markdown unico; la UI lo edita por secciones y al guardar lo reconcatena con
// encabezados "## Titulo". Asi se mantiene legible y git-friendly (README.dev.md:
// las secciones del cuerpo son configurables por plantilla).

export interface SectionDef {
  key: string;
  title: string;
  /** Ocupa todo el ancho de la grilla del editor. */
  full?: boolean;
  /** Orientacion editorial; no se inserta en el reporte. */
  guidance?: string;
}

// Orden convencional de pentest: Descripcion, Impacto, Prueba de concepto y
// por ultimo Remediacion. El PoC es markdown como las demas (estilo HackerOne:
// paso a paso con evidencia, capturas pegadas e includes de codigo).
export const FINDING_SECTIONS: SectionDef[] = [
  {
    key: "descripcion",
    title: "Descripcion",
    full: true,
    guidance:
      "Explica que encontraste, donde y bajo que condiciones. Documenta los pasos y capturas en Prueba de concepto.",
  },
  {
    key: "impacto",
    title: "Impacto",
    full: true,
    guidance:
      "Distingue el impacto demostrado de los escenarios potenciales e indica las limitaciones de la prueba.",
  },
  {
    key: "poc",
    title: "Prueba de concepto",
    full: true,
    guidance:
      "Orden: precondiciones, pasos numerados, resultado esperado, resultado observado y evidencias. Pega las capturas junto al paso que respaldan.",
  },
  {
    key: "remediacion",
    title: "Remediacion",
    full: true,
    guidance: "Indica acciones concretas y como verificar que la correccion resuelve el problema.",
  },
];

/** Normaliza un titulo para comparar (minusculas, sin acentos). */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const TITLE_TO_KEY = new Map([
  ...FINDING_SECTIONS.map((s) => [normalize(s.title), s.key] as const),
  ["poc", "poc"],
  ["proof of concept", "poc"],
  ["description", "descripcion"],
  ["impact", "impacto"],
  ["remediation", "remediacion"],
]);

/** Parsea un cuerpo markdown a un mapa key -> contenido por seccion. */
export function parseSections(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const s of FINDING_SECTIONS) result[s.key] = "";

  let current = FINDING_SECTIONS[0].key;
  const buffers: Record<string, string[]> = {};
  for (const s of FINDING_SECTIONS) buffers[s.key] = [];

  let fence: { marker: string; length: number } | null = null;
  for (const line of body.split("\n")) {
    const marker = line.replace(/\r$/, "").match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence.marker &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      buffers[current].push(line);
      continue;
    }
    if (marker && !(marker[1][0] === "`" && marker[2].includes("`"))) {
      fence = { marker: marker[1][0], length: marker[1].length };
      buffers[current].push(line);
      continue;
    }
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const key = TITLE_TO_KEY.get(normalize(heading[1]));
      if (key) {
        current = key;
        continue;
      }
    }
    buffers[current].push(line);
  }

  for (const s of FINDING_SECTIONS) {
    result[s.key] = buffers[s.key].join("\n").trim();
  }
  return result;
}

/** Reconstruye el cuerpo markdown a partir del mapa de secciones. */
export function joinSections(sections: Record<string, string>): string {
  const parts: string[] = [];
  for (const s of FINDING_SECTIONS) {
    const content = (sections[s.key] ?? "").trim();
    parts.push(`## ${s.title}\n\n${content}`);
  }
  return parts.join("\n\n").trim() + "\n";
}
