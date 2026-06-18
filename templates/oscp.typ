// Plantilla "OSCP Exam Report" de PuduReport.
//
// Estructura inspirada en la OSCP-Exam-Report-Template-Markdown de noraj
// (github.com/noraj, MIT). Reimplementada en Typst; consume el mismo
// build/data.json que el resto. Llena las secciones (Introduccion, Objetivo,
// High-Level Summary, Metodologia...) en la pestaña Reporte; cada maquina o
// vulnerabilidad es un hallazgo (con su IP en "activos afectados").

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

// --- Pagina + marca de agua ---
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
    OSCP Exam Report #h(1fr) #project.client #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
)
#set text(font: ("Helvetica Neue", "Arial"), size: 10.5pt, lang: "es")
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)
#show heading.where(level: 1): it => [
  #set text(size: 15pt, fill: brand, weight: "bold")
  #block(above: 1.3em, below: 0.5em)[#it]
]
#show heading.where(level: 2): it => [
  #set text(size: 12pt, weight: "bold")
  #block(above: 1em, below: 0.4em)[#it]
]

// --- Portada estilo examen ---
#set page(footer: none, background: if ws.branding.cover_background != "" {
  image(ws.branding.cover_background, width: 100%, height: 100%, fit: "cover")
})
#block(fill: brand, width: 100%, height: 10pt)
#v(5cm)
#align(center)[
  #if ws.branding.logo_path != "" [#image(ws.branding.logo_path, width: 4.5cm)#v(0.8cm)]
  #text(size: 13pt, fill: brand, weight: "bold")[Offensive Security Certified Professional]
  #v(0.2cm)
  #text(size: 30pt, weight: "bold")[Exam Penetration Test Report]
  #v(0.3cm)
  #line(length: 35%, stroke: 1pt + brand)
]
#v(1fr)
#align(center, box(width: 70%)[
  #grid(
    columns: (auto, 1fr),
    row-gutter: 7pt,
    column-gutter: 14pt,
    align: (right, left),
    [*Candidato:*], project.client,
    [*OSID:*], [—],
    [*Equipo:*],
    if project.team.len() > 0 { project.team.map(m => m.name).join(", ") } else [—],
    [*Fecha:*], [#project.start_date — #project.end_date],
  )
])
#v(2cm)
#align(center, text(size: 9pt, fill: gray)[
  Este documento contiene informacion confidencial. Su distribucion esta restringida.
])
#pagebreak()

// --- Page para el resto (footer + watermark) ---
#set page(
  footer: context [
    #set text(size: 8pt, fill: gray)
    OSCP Exam Report #h(1fr) #project.client #h(1fr) #counter(page).display("1 / 1", both: true)
  ],
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
)

// --- Indice de contenidos ---
#outline(title: [Table of Contents], depth: 2, indent: 1em)
#pagebreak()

// --- Resumen de severidades ---
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

// --- Secciones de prosa (Introduccion, Objetivo, Metodologia, etc.) ---
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 1, section.title)
    {
      set heading(outlined: false)
      eval(section.body, mode: "markup")
    }
  }
}

// --- Hallazgos / Objetivos ---
#pagebreak()
#heading(level: 1)[Hallazgos]
#for (i, f) in data.findings.enumerate() {
  let color = sev-color.at(f.severity, default: sev-color.info)
  if i > 0 and ws.branding.findings_page_break { pagebreak() }
  block(
    breakable: false,
    width: 100%,
    inset: (left: 10pt),
    stroke: (left: 3pt + color),
  )[
    #heading(level: 2, str(i + 1) + ". " + f.title)
    #badge(sev-label.at(f.severity, default: f.severity), color)
    #h(6pt)
    #if f.cvss != "" [
      #box(fill: color, inset: (x: 6pt, y: 3pt), radius: 3pt)[
        #text(size: 8pt, weight: "bold", fill: white)[CVSS #f.cvss_version: #f.cvss]
      ]
      #h(6pt)
    ]
    #if f.cwe != "" [#box(fill: luma(240), inset: (x: 6pt, y: 3pt), radius: 3pt, text(size: 8pt)[#f.cwe]) #h(6pt)]
    #status-chip(f.status)
  ]
  if f.cvss_vector != "" {
    block(above: 6pt, vector-chip(f.cvss_vector))
  }
  if f.affected.len() > 0 {
    block(above: 6pt)[*Objetivo / activos:* #f.affected.map(a => raw(a)).join(", ")]
  }
  v(4pt)
  {
    set heading(outlined: false)
    eval(f.body, mode: "markup")
  }
  v(0.6cm)
}
