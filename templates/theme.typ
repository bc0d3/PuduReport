// Libreria de diseno compartida por las plantillas de PuduReport.
//
// Centraliza lo que es identico en las 8 plantillas builtin: colores y
// etiquetas de severidad/estado, chips, badges, resolucion de fuentes y el
// estilo de los bloques de codigo. Cada plantilla sigue definiendo su propia
// pagina, marca de agua, portada y encabezados: eso varia legitimamente
// entre plantillas y no se centraliza aca (ver oscp.typ para un ejemplo de
// encabezados intencionalmente distintos).
//
// Uso: #import "theme.typ": *
// El backend copia este archivo junto a report.typ al compilar, tanto para
// plantillas builtin como para overrides de usuario en library/templates.

// --- Colores y etiquetas de severidad ---
#let sev-color = (
  critical: rgb("#a32d2d"),
  high: rgb("#c2410c"),
  medium: rgb("#ba7517"),
  low: rgb("#639922"),
  info: rgb("#78716c"),
)
#let sev-label = (
  critical: "Critica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  info: "Informativa",
)
#let status-label = (
  open: "Abierto",
  fixed: "Corregido",
  accepted: "Aceptado",
  wontfix: "No se corregira",
)
#let status-color = (
  open: rgb("#c2410c"),
  fixed: rgb("#639922"),
  accepted: rgb("#2563eb"),
  wontfix: rgb("#78716c"),
)

// Chip con borde de color (estado) y chip mono para el vector CVSS.
#let status-chip(status) = box(
  inset: (x: 6pt, y: 2pt),
  radius: 3pt,
  stroke: 0.7pt + status-color.at(status, default: rgb("#78716c")),
  text(size: 8pt, weight: "bold", fill: status-color.at(status, default: rgb("#78716c")), upper(
    status-label.at(status, default: status),
  )),
)
#let vector-chip(vec, mono-font) = box(
  fill: luma(236),
  stroke: 0.5pt + luma(200),
  inset: (x: 6pt, y: 3pt),
  radius: 3pt,
  text(size: 8pt, fill: luma(60), font: mono-font, vec),
)

#let badge(text-content, fill-color) = box(
  fill: fill-color,
  inset: (x: 7pt, y: 3pt),
  radius: 3pt,
  text(fill: white, weight: "bold", size: 8pt, upper(text-content)),
)

// --- Fuentes: la del branding primero, con respaldo del sistema para que el
// PDF siempre renderice aunque la fuente elegida no este instalada. ---
#let default-body-font(branding) = if branding.at("body_font", default: "") != "" {
  (branding.body_font, "Helvetica Neue", "Arial", "Liberation Sans")
} else {
  ("Helvetica Neue", "Arial", "Liberation Sans")
}
// La cadena termina en "DejaVu Sans Mono", que Typst trae embebida en su
// binario: garantiza una monoespaciada real en cualquier ambiente (macOS,
// Windows, Linux, CI) sin instalar fuentes. No usar el generico "monospace":
// Typst no lo resuelve y cae a una serif (codigo desalineado y feo).
#let default-mono-font(branding) = if branding.at("mono_font", default: "") != "" {
  (branding.mono_font, "JetBrains Mono", "Menlo", "Consolas", "DejaVu Sans Mono")
} else {
  ("JetBrains Mono", "Menlo", "Consolas", "DejaVu Sans Mono")
}

// --- Bloques de codigo: fondo oscuro con resaltado + etiqueta de lenguaje.
// Cada plantilla solo necesita el wiring:
//   #show raw.where(block: true): it => render-code-block(it)
#let render-code-block(it) = block(
  width: 100%,
  fill: rgb("#1e1f24"),
  radius: 4pt,
  clip: true,
  stroke: 0.5pt + rgb("#2c2d34"),
)[
  #if it.lang != none [
    #block(width: 100%, fill: rgb("#2c2d34"), inset: (x: 9pt, y: 3pt))[
      #text(size: 7pt, weight: "bold", fill: rgb("#9aa0aa"), tracking: 0.4pt, upper(it.lang))
    ]
  ]
  #block(inset: 9pt, text(size: 8.5pt, fill: rgb("#e6e6e6"), it))
]
