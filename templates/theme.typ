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
#let render-code-block(it, font: default-mono-font((:)), size: 9pt) = block(
  width: 100%,
  fill: rgb("#1e1f24"),
  radius: 4pt,
  breakable: true,
  stroke: 0.5pt + rgb("#2c2d34"),
)[
  #if it.lang != none [
    #block(width: 100%, fill: rgb("#2c2d34"), inset: (x: 9pt, y: 3pt))[
      #text(size: 7pt, weight: "bold", fill: rgb("#9aa0aa"), tracking: 0.4pt, upper(it.lang))
    ]
  ]
  #block(inset: 10pt)[
    #set par(justify: false, leading: 0.65em)
    #set text(font: font, size: size, fill: rgb("#e6e6e6"))
    #it
  ]
]


// Base editorial. Una copia puede ajustar estos parametros sin duplicar reglas.
// No modifica datos ni impone el layout de un tipo de reporte a otro.
#let report-style(body-font, mono-font, body-size: 11pt, code-size: 9pt,
  leading: 0.7em, justify: false, body) = {
  set text(font: body-font, size: body-size, lang: "es", hyphenate: false)
  set par(justify: justify, leading: leading, spacing: 0.8em)
  set list(spacing: 0.45em)
  set enum(spacing: 0.45em)
  set table(inset: (x: 7pt, y: 6pt), stroke: 0.5pt + luma(215))
  show table: set text(size: 9.5pt)
  show table: set par(justify: false, leading: 0.6em)
  show table.cell.where(y: 0): set text(weight: "bold")
  show raw: set text(font: mono-font, size: 1em)
  show raw.where(block: false): set text(size: 0.92em)
  set raw(theme: "code-dark.tmTheme")
  show raw.where(block: true): it => render-code-block(it, font: mono-font, size: code-size)
  body
}

// Fechas opcionales: nunca imprimir un guion aislado ni inventar un periodo.
#let report-period(project) = {
  let start = project.start_date.trim()
  let end = project.end_date.trim()
  if start != "" and end != "" { start + " — " + end }
  else if start != "" { "Desde " + start }
  else if end != "" { "Hasta " + end }
  else { "" }
}

#let project-info(project) = {
  let cells = ()
  if project.client.trim() != "" { cells += ([*Cliente:*], project.client) }
  if report-period(project) != "" { cells += ([*Periodo:*], report-period(project)) }
  if project.team.len() > 0 {
    cells += ([*Equipo:*], project.team.map(m => {
      if m.role.trim() == "" { m.name } else { m.name + " (" + m.role + ")" }
    }).join(", "))
  }
  if cells.len() > 0 { grid(columns: (auto, 1fr), row-gutter: 6pt, column-gutter: 12pt, ..cells) }
}

// Activos son texto libre, no siempre IPs: conservar su tipografia y legibilidad.
#let affected-assets(items, label: "Activos afectados") = if items.len() > 0 {
  block(above: 8pt, below: 8pt)[
    #text(weight: "bold", label + ":")
    #set text(size: 10pt)
    #set par(justify: false)
    #list(..items)
  ]
}
