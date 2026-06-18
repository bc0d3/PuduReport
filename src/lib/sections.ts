// Secciones del cuerpo de un hallazgo. El archivo en disco sigue siendo un
// markdown unico; la UI lo edita por secciones y al guardar lo reconcatena con
// encabezados "## Titulo". Asi se mantiene legible y git-friendly (README.dev.md:
// las secciones del cuerpo son configurables por plantilla).

export interface SectionDef {
  key: string;
  title: string;
  /** Ocupa todo el ancho de la grilla del editor. */
  full?: boolean;
}

// Orden convencional de pentest: Descripcion, Impacto, Prueba de concepto y
// por ultimo Remediacion. El PoC es markdown como las demas (estilo HackerOne:
// paso a paso con evidencia, capturas pegadas e includes de codigo).
export const FINDING_SECTIONS: SectionDef[] = [
  { key: "descripcion", title: "Descripcion", full: true },
  { key: "impacto", title: "Impacto", full: true },
  { key: "poc", title: "Prueba de concepto", full: true },
  { key: "remediacion", title: "Remediacion", full: true },
];

/** Normaliza un titulo para comparar (minusculas, sin acentos). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const TITLE_TO_KEY = new Map(FINDING_SECTIONS.map((s) => [normalize(s.title), s.key]));

/** Parsea un cuerpo markdown a un mapa key -> contenido por seccion. */
export function parseSections(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const s of FINDING_SECTIONS) result[s.key] = "";

  let current = FINDING_SECTIONS[0].key;
  const buffers: Record<string, string[]> = {};
  for (const s of FINDING_SECTIONS) buffers[s.key] = [];

  for (const line of body.split("\n")) {
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
