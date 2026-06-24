// Plantilla "Respuesta a incidentes (DFIR)" de PuduReport.
//
// Informe de respuesta a incidentes: portada con kicker propio, indice y el
// cuerpo como un unico lienzo markdown. Sin tabla de hallazgos. Deriva de la
// plantilla de documento libre; solo cambia la identidad de la portada.
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

// --- Portada y cuerpo por bloques ---
// El cuerpo es una lista ordenada de bloques (project.layout). La portada es el
// bloque "cover". Documento libre: portada, indice y prosa.
#let logo = ws.branding.logo_path
#let cover-subtitle = ws.branding.at("cover_subtitle", default: "")
#let cover-show-logo = ws.branding.at("cover_show_logo", default: true)
#let cover-show-period = ws.branding.at("cover_show_period", default: true)
#let cover-show-org = ws.branding.at("cover_show_org", default: true)
#let cover-show-accent = ws.branding.at("cover_show_accent", default: true)

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

#let cover() = {
  // Color del TEXTO de la portada (titulo): si se definio cover_color, el titulo
  // usa ese color; si no, el del layout. No cambia el fondo, las lineas ni el cuerpo.
  let cover-text = {
    let c = ws.branding.at("cover_color", default: "")
    if c != "" { rgb(c) } else { none }
  }
  // Color de un texto de la portada: el de portada si se definio, o el dado.
  let ct(fallback) = if cover-text != none { cover-text } else { fallback }
  let cover_bg = ws.branding.cover_background
  // Fondo de portada: la imagen configurada, o la marca de agua si no hay.
  set page(background: if cover_bg != "" {
    image(cover_bg, width: 100%, height: 100%, fit: "cover")
  } else if watermark.enabled and watermark.text != "" {
    place(
      center + horizon,
      rotate(-45deg, box(text(
        size: watermark.size * 1pt,
        fill: rgb(180, 180, 180, int(watermark.opacity * 255)),
        weight: "bold",
        watermark.text,
      ))),
    )
  })
  if ws.branding.cover_layout == "canvas" and ws.branding.at("cover_elements", default: ()).len() > 0 {
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
  } else {
    align(left + horizon)[
      #if logo != "" and cover-show-logo [#image(logo, width: 4cm)#v(1cm)]
      #text(size: 11pt, weight: "bold", tracking: 3pt, fill: ct(brand))[RESPUESTA A INCIDENTES]
      #v(0.3cm)
      #text(size: 30pt, weight: "bold", fill: if cover-text != none { cover-text } else { brand }, project.name)
      #if cover-show-accent [#v(0.25cm)#line(length: 30%, stroke: 1pt + ct(brand))]
      #v(0.25cm)
      #text(size: 14pt, fill: ct(gray), project.client)
      #if cover-subtitle != "" [#v(0.25cm)#text(size: 12pt, fill: ct(brand), cover-subtitle)]
      #if org-line != none and cover-show-org [#v(0.25cm)#text(size: 11pt, fill: ct(gray), org-line)]
      #if cover-show-period [#v(0.6cm)#text(size: 10.5pt, fill: ct(gray))[#project.start_date — #project.end_date]]
    ]
  }
  pagebreak()
}

#let block-toc() = {
  if project.sections.any(s => s.body.trim() != "") {
    outline(title: [Indice de contenidos], depth: 2, indent: 1em)
    pagebreak()
  }
}

#let block-section(key) = {
  let s = project.sections.find(x => x.key == key)
  if s != none and s.body.trim() != "" {
    // Titulo vacio (lienzo markdown libre): se renderiza solo el cuerpo, sin un
    // encabezado de seccion de relleno.
    if s.title.trim() != "" {
      heading(level: 1, numbering: none, s.title)
    }
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

#let render-block(b) = {
  if b.enabled {
    let k = b.kind
    if k == "cover" { cover() } else if k == "toc" { block-toc() } else if k == "section" {
      block-section(b.at("config", default: (:)).at("key", default: none))
    } else if k == "text" { block-text(b) } else if k == "pagebreak" { pagebreak() }
  }
}

#for b in project.layout { render-block(b) }
