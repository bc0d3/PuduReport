// Plantilla "Retest / verificacion de remediacion" de PuduReport.
//
// Reporte centrado en el ESTADO de remediacion de hallazgos previos. Lidera con
// un resumen por estado (corregido / abierto / aceptado / no se corregira) y
// presenta cada hallazgo con su estado al frente. Util para la re-evaluacion
// posterior a un pentest. Aprovecha el campo status de cada hallazgo.
//
// Consume build/data.json (generado por el backend). Separacion estricta:
// estos .typ definen PRESENTACION; los datos llegan por JSON.

#let data = json("data.json")
#let ws = data.workspace
#let project = data.project
#let brand = rgb(ws.branding.primary_color)

// Fuentes: la del branding primero (si se definio), con el sistema de respaldo.
#let body-font = if ws.branding.at("body_font", default: "") != "" {
  (ws.branding.body_font, "Helvetica Neue", "Arial", "Liberation Sans")
} else {
  ("Helvetica Neue", "Arial", "Liberation Sans")
}
#let mono-font = if ws.branding.at("mono_font", default: "") != "" {
  (ws.branding.mono_font, "JetBrains Mono", "SF Mono", "monospace")
} else {
  ("JetBrains Mono", "SF Mono", "monospace")
}

// --- Colores por severidad ---
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
#let status-chip(status) = box(
  inset: (x: 6pt, y: 2pt),
  radius: 3pt,
  stroke: 0.7pt + status-color.at(status, default: rgb("#78716c")),
  text(size: 8pt, weight: "bold", fill: status-color.at(status, default: rgb("#78716c")), upper(
    status-label.at(status, default: status),
  )),
)
#let badge(text-content, fill-color) = box(
  fill: fill-color,
  inset: (x: 7pt, y: 3pt),
  radius: 3pt,
  text(fill: white, weight: "bold", size: 8pt, upper(text-content)),
)
#let status-badge(status) = badge(
  status-label.at(status, default: status),
  status-color.at(status, default: rgb("#78716c")),
)

// --- Configuracion de pagina + marca de agua ---
#let watermark = ws.watermark
#set page(
  paper: "a4",
  margin: (x: 2.2cm, top: 2.4cm, bottom: 2.2cm),
  background: if watermark.enabled and watermark.text != "" {
    place(
      center + horizon,
      rotate(-45deg, box(text(
        size: watermark.size * 1pt,
        fill: rgb(180, 180, 180, int(watermark.opacity * 255)),
        weight: "bold",
        watermark.text,
      ))),
    )
  },
  footer: context [
    #set text(size: 8pt, fill: gray)
    #ws.watermark.text #h(1fr) #project.client #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
)
#set text(font: body-font, size: 10.5pt, lang: "es")
#show raw: set text(font: mono-font)
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)

#show heading.where(level: 1): it => [
  #set text(size: 16pt, fill: brand, weight: "bold")
  #block(above: 1.4em, below: 0.8em)[#it]
]
#show heading.where(level: 2): it => [
  #set text(size: 12.5pt, fill: black, weight: "bold")
  #block(above: 1em, below: 0.5em)[#it]
]

// Bloques de codigo: fondo oscuro con resaltado + etiqueta de lenguaje.
#set raw(theme: "code-dark.tmTheme")
#show raw.where(block: true): it => block(
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

// Linea opcional con gerencia y area del cliente, para la portada.
#let org-line = {
  let parts = ()
  if project.gerencia != "" { parts.push(project.gerencia) }
  if project.area != "" { parts.push(project.area) }
  parts.join("  ·  ")
}

// --- Portada ---
#let logo = ws.branding.logo_path
#let cover-subtitle = ws.branding.at("cover_subtitle", default: "")
#let cover-show-logo = ws.branding.at("cover_show_logo", default: true)
#let cover-show-period = ws.branding.at("cover_show_period", default: true)
#let cover-show-org = ws.branding.at("cover_show_org", default: true)
#let cover-show-accent = ws.branding.at("cover_show_accent", default: true)
#align(center + horizon)[
  #if logo != "" and cover-show-logo [#image(logo, width: 5cm)#v(1.2cm)]
  #text(size: 32pt, weight: "bold", fill: brand, project.name)
  #v(0.3cm)
  #text(size: 14pt, fill: gray)[Verificacion de remediacion (retest)]
  #if cover-show-accent [#v(0.4cm)#line(length: 40%, stroke: 1pt + brand)]
  #v(0.4cm)
  #text(size: 18pt, project.client)
  #if cover-subtitle != "" [#v(0.3cm)#text(size: 13pt, fill: brand, cover-subtitle)]
  #if org-line != none and cover-show-org [#v(0.3cm)#text(size: 11pt, fill: gray, org-line)]
  #if cover-show-period [#v(2.5cm)#text(size: 11pt, fill: gray)[Periodo: #project.start_date — #project.end_date]]
]
#pagebreak()

// --- Indice de contenidos ---
#outline(title: [Indice de contenidos], depth: 2, indent: 1em)
#pagebreak()

// --- Informacion del proyecto ---
#heading(numbering: none)[Informacion del proyecto]
#grid(
  columns: (auto, 1fr),
  row-gutter: 6pt,
  column-gutter: 12pt,
  [*Cliente:*], project.client,
  [*Periodo:*], [#project.start_date — #project.end_date],
  [*Equipo:*],
  if project.team.len() > 0 {
    project.team.map(m => m.name + " (" + m.role + ")").join(", ")
  } else [—],
)

// --- Resumen por estado de remediacion ---
#let st-count(s) = data.findings.filter(f => f.status == s).len()
#v(0.5cm)
#heading(numbering: none)[Estado de remediacion]
#table(
  columns: (1fr, 1fr, 1fr, 1fr),
  align: center + horizon,
  stroke: 0.5pt + gray,
  table.header(
    badge("Corregido", status-color.fixed),
    badge("Abierto", status-color.open),
    badge("Aceptado", status-color.accepted),
    badge("No corregido", status-color.wontfix),
  ),
  text(weight: "bold", str(st-count("fixed"))),
  text(weight: "bold", str(st-count("open"))),
  text(weight: "bold", str(st-count("accepted"))),
  text(weight: "bold", str(st-count("wontfix"))),
)

// --- Indice de hallazgos con su estado ---
#if data.findings.len() > 0 {
  v(0.5cm)
  heading(numbering: none)[Hallazgos verificados]
  table(
    columns: (auto, 1fr, auto, auto),
    align: (center + horizon, left + horizon, center + horizon, center + horizon),
    stroke: 0.5pt + luma(220),
    table.header([*\#*], [*Hallazgo*], [*Severidad*], [*Estado*]),
    ..data.findings.enumerate().map(((i, f)) => (
      str(i + 1),
      f.title,
      badge(sev-label.at(f.severity, default: f.severity), sev-color.at(f.severity, default: sev-color.info)),
      status-badge(f.status),
    )).flatten(),
  )
}

// --- Secciones de prosa (alcance del retest, conclusiones...) ---
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 1, numbering: none, section.title)
    {
      set heading(outlined: false)
      eval(section.body, mode: "markup")
    }
  }
}

// --- Detalle por hallazgo (estado al frente) ---
#pagebreak()
#heading(level: 1, numbering: none)[Detalle de verificacion]

#for (i, f) in data.findings.enumerate() {
  let color = status-color.at(f.status, default: rgb("#78716c"))
  if i > 0 and ws.branding.findings_page_break { pagebreak() }
  block(
    breakable: false,
    width: 100%,
    inset: (left: 10pt),
    stroke: (left: 3pt + color),
  )[
    #heading(level: 2, numbering: none, str(i + 1) + ". " + f.title)
    #status-badge(f.status)
    #h(6pt)
    #badge(sev-label.at(f.severity, default: f.severity), sev-color.at(f.severity, default: sev-color.info))
  ]

  if f.affected.len() > 0 {
    block(above: 6pt)[*Activos afectados:* #f.affected.map(a => raw(a)).join(", ")]
  }
  v(4pt)
  {
    set heading(outlined: false)
    eval(f.body, mode: "markup")
  }
  v(0.6cm)
}
