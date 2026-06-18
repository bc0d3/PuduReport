// Plantilla "Informe ejecutivo / no tecnico" de PuduReport.
//
// Reporte SIN tabla de hallazgos: solo prosa estructurada. Para entregables de
// gestion, resumenes ejecutivos, cumplimiento u otros documentos no centrados
// en vulnerabilidades. El contenido vive en las secciones del reporte; los
// hallazgos tecnicos se ignoran aunque existan en el proyecto.
//
// Consume build/data.json (generado por el backend). Separacion estricta:
// estos .typ definen PRESENTACION; los datos llegan por JSON.
//
// Los cuerpos de secciones ya vienen como markup de Typst (convertidos desde
// markdown por el backend) y se insertan con eval(..).

#let data = json("data.json")
#let ws = data.workspace
#let project = data.project
#let brand = rgb(ws.branding.primary_color)

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
#set text(font: ("Helvetica Neue", "Arial", "Liberation Sans"), size: 10.5pt, lang: "es")
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

// --- Portada (layout configurable) ---
#let cover() = {
  let layout = ws.branding.cover_layout
  let logo = ws.branding.logo_path
  let cover_bg = ws.branding.cover_background

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

// --- Indice de contenidos ---
#outline(title: [Indice de contenidos], depth: 2, indent: 1em)
#pagebreak()

// --- Informacion del documento ---
#heading(numbering: none)[Informacion del documento]
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

// --- Resumen de severidades (solo si hay hallazgos) ---
// Cuando este informe se genera como salida ejecutiva de un pentest, muestra los
// conteos por severidad (no el detalle). En un ejecutivo puro, no hay hallazgos
// y esta seccion no aparece.
#let counts = data.severity_counts
#let total = counts.critical + counts.high + counts.medium + counts.low + counts.info
#if total > 0 {
  let sev-color = (
    critical: rgb("#a32d2d"),
    high: rgb("#c2410c"),
    medium: rgb("#ba7517"),
    low: rgb("#639922"),
    info: rgb("#78716c"),
  )
  let badge(label, fill-color) = box(
    fill: fill-color,
    inset: (x: 7pt, y: 3pt),
    radius: 3pt,
    text(fill: white, weight: "bold", size: 8pt, upper(label)),
  )
  v(0.5cm)
  heading(numbering: none)[Resumen de severidades]
  table(
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
}

// --- Secciones de prosa (el contenido del informe) ---
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 1, numbering: none, section.title)
    {
      set heading(outlined: false)
      eval(section.body, mode: "markup")
    }
  }
}
