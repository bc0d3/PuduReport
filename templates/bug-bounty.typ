// Plantilla "bug bounty" de PuduReport.
//
// Orientada a entregas individuales o de pocos hallazgos: portada minimal,
// foco en cada hallazgo como tarjeta, acento naranja. Consume build/data.json.

#let data = json("data.json")
#let ws = data.workspace
#let project = data.project
#let brand = rgb(ws.branding.primary_color)

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
#let vector-chip(vec) = box(
  fill: luma(236),
  stroke: 0.5pt + luma(200),
  inset: (x: 6pt, y: 3pt),
  radius: 3pt,
  text(size: 8pt, fill: luma(60), font: ("JetBrains Mono", "SF Mono", "monospace"), vec),
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
  margin: (x: 2cm, y: 2cm),
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
    #ws.watermark.text #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
)
#set text(font: ("Helvetica Neue", "Arial"), size: 10.5pt, lang: "es")
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)
#show heading.where(level: 2): it => [
  #set text(size: 12pt, fill: black, weight: "bold")
  #block(above: 0.9em, below: 0.4em)[#it]
]

// Encabezado minimal
#align(left)[
  #text(size: 22pt, weight: "bold", fill: brand, project.name)
  #v(2pt)
  #line(length: 25%, stroke: 1.5pt + sev-color.high)
  #v(2pt)
  #text(size: 12pt, fill: gray)[#project.client #h(8pt) · #h(8pt) #project.start_date — #project.end_date]
]
#v(0.4cm)

// Resumen rapido
#let counts = data.severity_counts
#box(fill: luma(245), inset: 10pt, radius: 5pt, width: 100%)[
  *Hallazgos:* #h(8pt)
  #badge("C " + str(counts.critical), sev-color.critical) #h(4pt)
  #badge("A " + str(counts.high), sev-color.high) #h(4pt)
  #badge("M " + str(counts.medium), sev-color.medium) #h(4pt)
  #badge("B " + str(counts.low), sev-color.low) #h(4pt)
  #badge("I " + str(counts.info), sev-color.info)
]

// Secciones de prosa (si tienen contenido)
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 2, section.title)
    eval(section.body, mode: "markup")
  }
}

#v(0.3cm)
#line(length: 100%, stroke: 0.5pt + luma(200))

// Hallazgos como tarjetas
#for (i, f) in data.findings.enumerate() {
  let color = sev-color.at(f.severity, default: sev-color.info)
  if i > 0 and ws.branding.findings_page_break { pagebreak() } else { v(0.4cm) }
  block(
    breakable: false,
    width: 100%,
    fill: luma(250),
    inset: 12pt,
    radius: 5pt,
    stroke: (left: 3pt + color),
  )[
    #badge(sev-label.at(f.severity, default: f.severity), color)
    #h(6pt)
    #text(size: 13pt, weight: "bold", str(i + 1) + ". " + f.title)
    #v(4pt)
    #if f.cvss != "" [
      #box(fill: color, inset: (x: 6pt, y: 3pt), radius: 3pt)[
        #text(size: 8pt, weight: "bold", fill: white)[CVSS #f.cvss_version: #f.cvss]
      ]
      #h(8pt)
    ]
    #if f.cwe != "" [#text(size: 8pt)[#f.cwe] #h(8pt)]
    #status-chip(f.status)
    #if f.cvss_vector != "" [
      #v(4pt)
      #vector-chip(f.cvss_vector)
    ]
    #if f.affected.len() > 0 [
      #v(4pt)
      #text(size: 9pt)[*Afecta:* #f.affected.map(a => raw(a)).join(", ")]
    ]
  ]
  v(4pt)
  eval(f.body, mode: "markup")
}
