// Plantilla "Hack The Box" de PuduReport (tema verde HTB, para maquinas/CTF).
//
// Consume build/data.json (generado por el backend). Separacion estricta:
// estos .typ definen PRESENTACION; los datos llegan por JSON. Disenar una
// plantilla nunca rompe hallazgos existentes.
//
// Los cuerpos de hallazgos y secciones ya vienen como markup de Typst
// (convertidos desde markdown por el backend) y se insertan con eval(..).

#let data = json("data.json")
#let ws = data.workspace
#let project = data.project
#let brand = rgb("#3a7d1e") // HTB green

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
// Chip con borde de color (estado) y chip mono para el vector CVSS.
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

// --- Configuracion de pagina + marca de agua ---
#let watermark = ws.watermark
#set page(
  paper: "a4",
  margin: (x: 2.2cm, top: 2.4cm, bottom: 2.2cm),
  background: if watermark.enabled and watermark.text != "" {
    // box() evita que el texto se parta; el tamano es configurable.
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
#set text(font: ("Helvetica Neue", "Arial", "Liberation Sans"), size: 10.5pt, lang: "es")
#set par(justify: true, leading: 0.65em)
// Sin numeracion automatica: los cuerpos de hallazgos traen sus propios
// encabezados (Descripcion/Impacto/...) y no deben numerarse.
#set heading(numbering: none)

#show heading.where(level: 1): it => [
  #set text(size: 16pt, fill: brand, weight: "bold")
  #block(above: 1.4em, below: 0.8em)[#it]
]
#show heading.where(level: 2): it => [
  #set text(size: 12.5pt, fill: black, weight: "bold")
  #block(above: 1em, below: 0.5em)[#it]
]

// --- Portada (layout configurable) ---
#let cover() = {
  let layout = ws.branding.cover_layout
  let logo = ws.branding.logo_path
  let cover_bg = ws.branding.cover_background

  // El fondo de portada (imagen) es independiente del logo.
  set page(
    footer: none,
    background: if cover_bg != "" {
      image(cover_bg, width: 100%, height: 100%, fit: "cover")
    } else {
      none
    },
  )
  if layout == "sidebar" {
    grid(
      columns: (4pt, 1fr),
      rows: 100%,
      fill: none,
      box(fill: brand, height: 100%, width: 4pt),
      pad(left: 1cm, align(left + horizon)[
        #if logo != "" [#image(logo, width: 4cm)#v(1cm)]
        #text(size: 30pt, weight: "bold", fill: brand, project.name)
        #v(0.3cm)
        #text(size: 16pt, project.client)
        #v(2cm)
        #text(size: 11pt, fill: gray)[#project.start_date — #project.end_date]
      ]),
    )
  } else if layout == "minimal" {
    align(left + horizon)[
      #text(size: 26pt, weight: "bold", project.name)
      #v(0.2cm)
      #line(length: 30%, stroke: 1pt + brand)
      #v(0.2cm)
      #text(size: 14pt, fill: gray, project.client)
    ]
  } else if layout == "full-bleed" {
    set page(margin: 0pt)
    // Con imagen de fondo: scrim oscuro translucido (opacidad configurable).
    block(
      fill: if cover_bg != "" { rgb(0, 0, 0, int(ws.branding.cover_scrim * 255)) } else { brand },
      width: 100%,
      height: 100%,
      inset: 3cm,
    )[
      #align(left + horizon)[
        #if logo != "" [#image(logo, width: 4cm)#v(1cm)]
        #text(size: 34pt, weight: "bold", fill: white, project.name)
        #v(0.4cm)
        #text(size: 18pt, fill: white.lighten(10%), project.client)
        #v(2cm)
        #text(size: 12pt, fill: white.lighten(20%))[#project.start_date — #project.end_date]
      ]
    ]
  } else {
    // centered (default)
    align(center + horizon)[
      #if logo != "" [#image(logo, width: 5cm)#v(1.2cm)]
      #text(size: 32pt, weight: "bold", fill: brand, project.name)
      #v(0.4cm)
      #line(length: 40%, stroke: 1pt + brand)
      #v(0.4cm)
      #text(size: 18pt, project.client)
      #v(2.5cm)
      #text(size: 11pt, fill: gray)[Periodo: #project.start_date — #project.end_date]
    ]
  }
  pagebreak()
}

#cover()

// --- Indice de contenidos (TOC con numeros de pagina) ---
#outline(title: [Indice de contenidos], depth: 2, indent: 1em)
#pagebreak()

// --- Equipo y alcance ---
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

#if project.scope.len() > 0 [
  #v(0.4cm)
  *Alcance:*
  #list(..project.scope.map(s => [#raw(s)]))
]

// --- Resumen de severidades ---
#let counts = data.severity_counts
#v(0.5cm)
#heading(numbering: none)[Resumen de hallazgos]
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

// --- Indice de hallazgos ---
#if data.findings.len() > 0 {
  v(0.5cm)
  heading(numbering: none)[Indice de hallazgos]
  table(
    columns: (auto, 1fr, auto),
    align: (center + horizon, left + horizon, center + horizon),
    stroke: 0.5pt + luma(220),
    table.header([*\#*], [*Hallazgo*], [*Severidad*]),
    ..data.findings.enumerate().map(((i, f)) => (
      str(i + 1),
      f.title,
      badge(sev-label.at(f.severity, default: f.severity), sev-color.at(f.severity, default: sev-color.info)),
    )).flatten(),
  )
}

// --- Secciones de prosa (resumen, alcance, metodologia, conclusiones) ---
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 1, numbering: none, section.title)
    // Los encabezados internos del cuerpo no van al indice de contenidos.
    {
      set heading(outlined: false)
      eval(section.body, mode: "markup")
    }
  }
}

// --- Hallazgos detallados ---
#pagebreak()
#heading(level: 1, numbering: none)[Hallazgos]

#for (i, f) in data.findings.enumerate() {
  let color = sev-color.at(f.severity, default: sev-color.info)
  // Opcion: cada hallazgo en su propia hoja.
  if i > 0 and ws.branding.findings_page_break { pagebreak() }
  block(
    breakable: false,
    width: 100%,
    inset: (left: 10pt),
    stroke: (left: 3pt + color),
  )[
    #heading(level: 2, numbering: none, str(i + 1) + ". " + f.title)
    #badge(sev-label.at(f.severity, default: f.severity), color)
    #h(6pt)
    #if f.cvss != "" [
      #box(fill: color, inset: (x: 6pt, y: 3pt), radius: 3pt)[
        #text(size: 8pt, weight: "bold", fill: white)[CVSS #f.cvss_version: #f.cvss]
      ]
    ]
    #if f.cwe != "" [#h(6pt) #box(fill: luma(240), inset: (x: 6pt, y: 3pt), radius: 3pt, text(size: 8pt)[#f.cwe])]
    #h(6pt)
    #status-chip(f.status)
  ]

  if f.cvss_vector != "" {
    block(above: 6pt, vector-chip(f.cvss_vector))
  }
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
