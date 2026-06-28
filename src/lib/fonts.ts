// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

// Sugerencias de fuentes para las plantillas de PDF. Es solo una lista para el
// datalist: el usuario puede escribir cualquier fuente instalada en el sistema.
// Vacio = la plantilla usa su fuente del sistema por defecto. Ampliable: agregar
// una entrada aca la suma a las sugerencias.

/** Fuentes del cuerpo sugeridas (comunes y cross-platform). */
export const BODY_FONT_SUGGESTIONS: string[] = [
  "Helvetica Neue",
  "Arial",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Cambria",
  "Verdana",
  "Tahoma",
  "Liberation Sans",
  "Liberation Serif",
];

/** Fuentes monoespaciadas sugeridas para codigo y vectores CVSS. */
export const MONO_FONT_SUGGESTIONS: string[] = [
  "JetBrains Mono",
  "SF Mono",
  "Consolas",
  "Courier New",
  "Menlo",
  "Monaco",
  "DejaVu Sans Mono",
  "Liberation Mono",
];
