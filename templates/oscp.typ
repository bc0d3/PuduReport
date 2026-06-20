// Plantilla "OSCP Exam Report" de PuduReport.
//
// Rediseno fiel al reporte de examen de Offensive Security (plantilla Eisvogel):
// portada full-bleed de color, headings numerados (1, 1.1, 1.1.1),
// header/footer con regla, codigo en bloque y tipografia limpia. Reimplementada
// en Typst; consume el mismo build/data.json que el resto. La marca y los
// nombres propios de OffSec NO se incrustan: el color y el logo salen del
// branding del workspace. Cada maquina o vulnerabilidad es un hallazgo (con su
// IP en "activos afectados"); las secciones (Introduccion, Objetivo,
// High-Level Summary, Metodologia...) se llenan en la pestaña Reporte.

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
  text(size: 8pt, fill: luma(60), font: mono-font, vec),
)
#let badge(text-content, fill-color) = box(
  fill: fill-color,
  inset: (x: 7pt, y: 3pt),
  radius: 3pt,
  text(fill: white, weight: "bold", size: 8pt, upper(text-content)),
)

#let watermark = ws.watermark
#let report-title = "Offensive Security Certified Professional Exam Report"

// --- Tipografia y headings numerados (estilo examen) ---
#set text(font: body-font, size: 10.5pt, lang: "es")
#show raw: set text(font: mono-font)
#set par(justify: true, leading: 0.65em)
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => block(above: 1.4em, below: 0.6em, text(
  size: 15pt, weight: "bold", fill: luma(20), it,
))
#show heading.where(level: 2): it => block(above: 1em, below: 0.4em, text(
  size: 12pt, weight: "bold", fill: luma(30), it,
))
#show heading.where(level: 3): it => block(above: 0.8em, below: 0.3em, text(
  size: 10.5pt, weight: "bold", fill: luma(45), it,
))

// Bloques de codigo: fondo oscuro con resaltado de sintaxis. La etiqueta de
// lenguaje (```http, ```sql...) se muestra como cabecera del bloque.
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

// Tablas minimalistas (solo lineas horizontales, estilo booktabs).
#set table(stroke: (_, y) => if y == 0 {
  (bottom: 0.7pt + luma(120))
} else {
  (bottom: 0.4pt + luma(210))
})

// --- Portada full-bleed de color de marca ---
#set page(
  paper: "a4",
  margin: (x: 2.5cm, top: 2.6cm, bottom: 2.6cm),
  fill: brand,
  header: none,
  footer: none,
)
#set text(fill: white)

#if ws.branding.cover_background != "" [
  #place(top + left, dx: -2.5cm, dy: -2.6cm, image(
    ws.branding.cover_background, width: 21cm, height: 29.7cm, fit: "cover",
  ))
  #place(top + left, dx: -2.5cm, dy: -2.6cm, rect(
    width: 21cm, height: 29.7cm, fill: rgb(0, 0, 0, int(ws.branding.cover_scrim * 255)),
  ))
]

#v(1.5cm)
#line(length: 100%, stroke: 2pt + white)
#v(1fr)
#if ws.branding.logo_path != "" [
  #image(ws.branding.logo_path, width: 4cm)
  #v(0.8cm)
]
#text(size: 27pt, weight: "bold")[#report-title]
#v(0.35cm)
#text(size: 14pt)[#if project.name != "" { project.name } else { "OSCP Exam Report" }]
#v(1.2cm)
#text(size: 11.5pt)[
  #project.client
  #if project.osid != "" [ #h(5pt) · #h(5pt) OSID: #project.osid ]
  #if project.team.len() > 0 [ #h(5pt) · #h(5pt) #project.team.map(m => m.name).join(", ") ]
]
#{
  let parts = ()
  if project.gerencia != "" { parts.push(project.gerencia) }
  if project.area != "" { parts.push(project.area) }
  if parts.len() > 0 [
    #v(0.35cm)
    #text(size: 10.5pt)[#parts.join("  ·  ")]
  ]
}
#v(1fr)
#text(size: 11pt)[#project.start_date #sym.dash.em #project.end_date]
#pagebreak()

// --- Paginas de contenido: fondo blanco, header/footer con regla y watermark ---
#set text(fill: black)
#set page(
  fill: white,
  margin: (x: 2.4cm, top: 2.6cm, bottom: 2.4cm),
  header: context {
    set text(size: 8pt, fill: luma(110))
    grid(columns: (1fr, auto), align: (left, right), report-title, project.end_date)
    v(1pt)
    line(length: 100%, stroke: 0.5pt + luma(190))
  },
  footer: context {
    line(length: 100%, stroke: 0.5pt + luma(190))
    v(2pt)
    set text(size: 8pt, fill: luma(110))
    grid(columns: (1fr, auto), align: (left, right), project.client, counter(page).display("1"))
  },
  background: if watermark.enabled and watermark.text != "" {
    place(center + horizon, rotate(-45deg, box(text(
      size: watermark.size * 1pt,
      fill: rgb(180, 180, 180, int(watermark.opacity * 255)),
      weight: "bold",
      watermark.text,
    ))))
  },
)
#counter(page).update(1)

// --- Indice de contenidos ---
#outline(title: [Table of Contents], depth: 3, indent: 1em)
#pagebreak()

// --- Resumen de severidades ---
#let counts = data.severity_counts
#heading(level: 1, numbering: none)[Resumen de hallazgos]
#table(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr),
  align: center + horizon,
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

// --- Hallazgos (cada uno como seccion numerada; el cuerpo anida bajo el) ---
#pagebreak()
#for (i, f) in data.findings.enumerate() {
  let color = sev-color.at(f.severity, default: sev-color.info)
  if i > 0 and ws.branding.findings_page_break { pagebreak() }
  block(
    breakable: false,
    width: 100%,
    inset: (left: 10pt),
    stroke: (left: 3pt + color),
  )[
    #heading(level: 1, f.title)
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
