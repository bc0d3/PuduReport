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
  text(size: 8pt, fill: luma(60), font: mono-font, vec),
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
#set text(font: body-font, size: 10.5pt, lang: "es")
#show raw: set text(font: mono-font)
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

// --- Portada (layout configurable) ---
// Render de un elemento del lienzo libre de portada (cover_layout = "canvas").
#let cover-element(el) = {
  let ew = el.at("w", default: 0.3)
  let fs = el.at("font_size", default: 0)
  let al = el.at("align", default: "left")
  let aln = if al == "center" { center } else if al == "right" { right } else { left }
  let wt = el.at("weight", default: "normal")
  let col = el.at("color", default: "")
  let fill = if col != "" { rgb(col) } else { black }
  let kind = el.kind
  if kind == "logo" {
    if ws.branding.logo_path != "" { image(ws.branding.logo_path, width: ew * 21cm) }
  } else if kind == "image" {
    let s = el.at("src", default: "")
    if s != "" { image(s, width: ew * 21cm) }
  } else {
    let t = if kind == "title" { project.name } else if kind == "client" {
      project.client
    } else if kind == "subtitle" {
      ws.branding.at("cover_subtitle", default: "")
    } else if kind == "period" [#project.start_date — #project.end_date] else if kind == "text" {
      el.at("content", default: "")
    } else { "" }
    box(width: ew * 21cm)[
      #set text(
        size: if fs > 0 { fs * 1pt } else { 12pt },
        fill: fill,
        weight: if wt == "bold" { "bold" } else { "regular" },
      )
      #set par(justify: false)
      #align(aln, t)
    ]
  }
}

// Dibuja la portada-lienzo: cada elemento posicionado en absoluto con place().
#let cover-canvas() = {
  set page(margin: 0pt)
  block(width: 100%, height: 100%, {
    for el in ws.branding.cover_elements {
      place(
        top + left,
        dx: el.at("x", default: 0.0) * 100%,
        dy: el.at("y", default: 0.0) * 100%,
        cover-element(el),
      )
    }
  })
}

#let cover() = {
  // Color del TEXTO de la portada (titulo): si se definio cover_color, el titulo
  // usa ese color; si no, el del layout. No cambia el fondo, las lineas ni el cuerpo.
  let cover-text = {
    let c = ws.branding.at("cover_color", default: "")
    if c != "" { rgb(c) } else { none }
  }
  // Color de un texto de la portada: el de portada si se definio, o el dado.
  let ct(fallback) = if cover-text != none { cover-text } else { fallback }
  let layout = ws.branding.cover_layout
  let logo = ws.branding.logo_path
  let cover_bg = ws.branding.cover_background
  let subtitle = ws.branding.at("cover_subtitle", default: "")
  let show_logo = ws.branding.at("cover_show_logo", default: true)
  let show_period = ws.branding.at("cover_show_period", default: true)
  let show_org = ws.branding.at("cover_show_org", default: true)
  let show_accent = ws.branding.at("cover_show_accent", default: true)

  // El fondo de portada (imagen) es independiente del logo.
  set page(
    footer: none,
    background: if cover_bg != "" {
      image(cover_bg, width: 100%, height: 100%, fit: "cover")
    } else {
      none
    },
  )
  if layout == "canvas" and ws.branding.at("cover_elements", default: ()).len() > 0 {
    cover-canvas()
  } else if layout == "sidebar" {
    grid(
      columns: (4pt, 1fr),
      rows: 100%,
      fill: none,
      box(fill: ct(brand), height: 100%, width: 4pt),
      pad(left: 1cm, align(left + horizon)[
        #if logo != "" and show_logo [#image(logo, width: 4cm)#v(1cm)]
        #text(size: 30pt, weight: "bold", fill: if cover-text != none { cover-text } else { brand }, project.name)
        #v(0.3cm)
        #text(size: 16pt, fill: ct(black), project.client)
        #if subtitle != "" [#v(0.2cm)#text(size: 13pt, fill: ct(brand), subtitle)]
        #if org-line != none and show_org [#v(0.3cm)#text(size: 11pt, fill: ct(gray), org-line)]
        #if show_period [#v(2cm)#text(size: 11pt, fill: ct(gray))[#project.start_date — #project.end_date]]
      ]),
    )
  } else if layout == "minimal" {
    align(left + horizon)[
      #text(size: 26pt, weight: "bold", fill: if cover-text != none { cover-text } else { black }, project.name)
      #if show_accent [#v(0.2cm)#line(length: 30%, stroke: 1pt + ct(brand))]
      #v(0.2cm)
      #text(size: 14pt, fill: ct(gray), project.client)
      #if subtitle != "" [#v(0.2cm)#text(size: 12pt, fill: ct(brand), subtitle)]
      #if org-line != none and show_org [#v(0.2cm)#text(size: 11pt, fill: ct(gray), org-line)]
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
        #if logo != "" and show_logo [#image(logo, width: 4cm)#v(1cm)]
        #text(size: 34pt, weight: "bold", fill: if cover-text != none { cover-text } else { white }, project.name)
        #v(0.4cm)
        #text(size: 18pt, fill: ct(white.lighten(10%)), project.client)
        #if subtitle != "" [#v(0.3cm)#text(size: 13pt, fill: ct(white.lighten(20%)), subtitle)]
        #if org-line != none and show_org [#v(0.3cm)#text(size: 12pt, fill: ct(white.lighten(20%)), org-line)]
        #if show_period [#v(2cm)#text(size: 12pt, fill: ct(white.lighten(20%)))[#project.start_date — #project.end_date]]
      ]
    ]
  } else {
    // centered (default)
    align(center + horizon)[
      #if logo != "" and show_logo [#image(logo, width: 5cm)#v(1.2cm)]
      #text(size: 32pt, weight: "bold", fill: if cover-text != none { cover-text } else { brand }, project.name)
      #if show_accent [#v(0.4cm)#line(length: 40%, stroke: 1pt + ct(brand))]
      #v(0.4cm)
      #text(size: 18pt, fill: ct(black), project.client)
      #if subtitle != "" [#v(0.3cm)#text(size: 13pt, fill: ct(brand), subtitle)]
      #if org-line != none and show_org [#v(0.3cm)#text(size: 11pt, fill: ct(gray), org-line)]
      #if show_period [#v(2.5cm)#text(size: 11pt, fill: gray)[Periodo: #project.start_date — #project.end_date]]
    ]
  }
  pagebreak()
}

// --- Cuerpo por bloques ---
// El cuerpo es una lista ordenada de bloques (project.layout). La portada es el
// bloque "cover". HTB comparte la estructura del reporte de pentest.

#let block-toc() = {
  outline(title: [Indice de contenidos], depth: 2, indent: 1em)
  pagebreak()
}

#let block-info() = {
  heading(numbering: none)[Informacion del proyecto]
  grid(
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
  if project.scope.len() > 0 {
    v(0.4cm)
    [*Alcance:*]
    list(..project.scope.map(s => [#raw(s)]))
  }
}

#let block-severity() = {
  let counts = data.severity_counts
  v(0.5cm)
  heading(numbering: none)[Resumen de hallazgos]
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

#let block-findings-index() = {
  if data.findings.len() > 0 {
    v(0.5cm)
    heading(numbering: none)[Indice de hallazgos]
    table(
      columns: (auto, 1fr, auto, auto),
      align: (center + horizon, left + horizon, center + horizon, center + horizon),
      stroke: 0.5pt + luma(220),
      table.header([*\#*], [*Hallazgo*], [*Severidad*], [*Estado*]),
      ..data.findings.enumerate().map(((i, f)) => (
        str(i + 1),
        f.title,
        badge(sev-label.at(f.severity, default: f.severity), sev-color.at(f.severity, default: sev-color.info)),
        status-chip(f.status),
      )).flatten(),
    )
  }
}

#let block-section(key) = {
  let s = project.sections.find(x => x.key == key)
  if s != none and s.body.trim() != "" {
    heading(level: 1, numbering: none, s.title)
    {
      set heading(outlined: false)
      eval(s.body, mode: "markup")
    }
  }
}

#let block-text(b) = {
  let cfg = b.at("config", default: (:))
  let title = cfg.at("title", default: "")
  let body = cfg.at("body", default: "")
  if title != "" { heading(level: 1, numbering: none, title) }
  if body != "" {
    set heading(outlined: false)
    eval(body, mode: "markup")
  }
}

#let block-findings() = {
  pagebreak()
  heading(level: 1, numbering: none)[Hallazgos]
  for (i, f) in data.findings.enumerate() {
    let color = sev-color.at(f.severity, default: sev-color.info)
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
}

#let render-block(b) = {
  if b.enabled {
    let k = b.kind
    if k == "cover" { cover() } else if k == "toc" { block-toc() } else if k == "info" {
      block-info()
    } else if k == "severity" { block-severity() } else if k == "findings_index" {
      block-findings-index()
    } else if k == "findings" { block-findings() } else if k == "section" {
      block-section(b.at("config", default: (:)).at("key", default: none))
    } else if k == "text" { block-text(b) } else if k == "pagebreak" { pagebreak() }
  }
}

#for b in project.layout { render-block(b) }
