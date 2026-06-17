// Plantilla "infraestructura" de PuduReport.
//
// Orientada a pentest de infraestructura: portada con barra lateral, enfasis
// en alcance/activos como tabla, acento teal. Consume build/data.json.

#let data = json("data.json")
#let ws = data.workspace
#let project = data.project
#let brand = rgb(ws.branding.primary_color)
#let accent = rgb("#0f766e")

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

#let badge(text-content, fill-color) = box(
  fill: fill-color,
  inset: (x: 7pt, y: 3pt),
  radius: 3pt,
  text(fill: white, weight: "bold", size: 8pt, upper(text-content)),
)

#let watermark = ws.watermark
#set page(
  paper: "a4",
  margin: (x: 2.2cm, top: 2.4cm, bottom: 2.2cm),
  background: if watermark.enabled and watermark.text != "" {
    place(
      center + horizon,
      rotate(-45deg, text(
        size: 90pt,
        fill: rgb(180, 180, 180, int(watermark.opacity * 255)),
        weight: "bold",
        watermark.text,
      )),
    )
  },
  footer: context [
    #set text(size: 8pt, fill: gray)
    #ws.watermark.text #h(1fr) #project.client #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
)
#set text(font: ("Helvetica Neue", "Arial"), size: 10.5pt, lang: "es")
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)
#show heading.where(level: 1): it => [
  #set text(size: 15pt, fill: accent, weight: "bold")
  #block(above: 1.3em, below: 0.6em)[#it]
]
#show heading.where(level: 2): it => [
  #set text(size: 12pt, weight: "bold")
  #block(above: 0.9em, below: 0.4em)[#it]
]

// Portada con barra lateral
#set page(footer: none, background: none)
#grid(
  columns: (5pt, 1fr),
  rows: 100%,
  box(fill: accent, height: 100%, width: 5pt),
  pad(left: 1cm, align(left + horizon)[
    #if ws.branding.logo_path != "" [#image(ws.branding.logo_path, width: 4cm)#v(1cm)]
    #text(size: 12pt, fill: accent, weight: "bold")[REPORTE DE INFRAESTRUCTURA]
    #v(0.3cm)
    #text(size: 30pt, weight: "bold", project.name)
    #v(0.3cm)
    #text(size: 16pt, fill: gray, project.client)
    #v(2cm)
    #text(size: 11pt, fill: gray)[#project.start_date — #project.end_date]
  ]),
)
#pagebreak()

// Restaurar page con footer y watermark para el resto
#set page(
  footer: context [
    #set text(size: 8pt, fill: gray)
    #ws.watermark.text #h(1fr) #project.client #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
  background: if watermark.enabled and watermark.text != "" {
    place(
      center + horizon,
      rotate(-45deg, text(
        size: 90pt,
        fill: rgb(180, 180, 180, int(watermark.opacity * 255)),
        weight: "bold",
        watermark.text,
      )),
    )
  },
)

// Alcance / activos como tabla destacada
#heading(level: 1)[Alcance y activos]
#if project.scope.len() > 0 {
  table(
    columns: (auto, 1fr),
    align: (center + horizon, left + horizon),
    stroke: 0.5pt + luma(200),
    table.header([*\#*], [*Activo*]),
    ..project.scope.enumerate().map(((i, s)) => (str(i + 1), raw(s))).flatten(),
  )
} else [Sin activos definidos.]

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

// Resumen de severidades
#let counts = data.severity_counts
#heading(level: 1)[Resumen de hallazgos]
#table(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr),
  align: center + horizon,
  stroke: 0.5pt + gray,
  table.header(
    badge("Critica", sev-color.critical),
    badge("Alta", sev-color.high),
    badge("Media", sev-color.medium),
    badge("Baja", sev-color.low),
    badge("Info", sev-color.info),
  ),
  text(weight: "bold", str(counts.critical)),
  text(weight: "bold", str(counts.high)),
  text(weight: "bold", str(counts.medium)),
  text(weight: "bold", str(counts.low)),
  text(weight: "bold", str(counts.info)),
)

// Secciones de prosa
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 1, section.title)
    eval(section.body, mode: "markup")
  }
}

// Hallazgos
#pagebreak()
#heading(level: 1)[Hallazgos]
#for f in data.findings {
  let color = sev-color.at(f.severity, default: sev-color.info)
  block(
    breakable: false,
    width: 100%,
    inset: (left: 10pt),
    stroke: (left: 3pt + color),
  )[
    #heading(level: 2, f.title)
    #badge(sev-label.at(f.severity, default: f.severity), color)
    #h(6pt)
    #if f.cvss != "" [
      #box(fill: luma(240), inset: (x: 6pt, y: 3pt), radius: 3pt)[
        #text(size: 8pt, weight: "bold")[CVSS #f.cvss_version: #f.cvss]
      ]
      #h(6pt)
    ]
    #if f.cwe != "" [#box(fill: luma(240), inset: (x: 6pt, y: 3pt), radius: 3pt, text(size: 8pt)[#f.cwe]) #h(6pt)]
    #text(size: 8pt, fill: gray)[Estado: #status-label.at(f.status, default: f.status)]
  ]
  if f.cvss_vector != "" {
    block(above: 4pt, text(size: 8pt, fill: gray)[#raw(f.cvss_vector)])
  }
  if f.affected.len() > 0 {
    block(above: 6pt)[*Activos afectados:* #f.affected.map(a => raw(a)).join(", ")]
  }
  v(4pt)
  eval(f.body, mode: "markup")
  v(0.6cm)
}
