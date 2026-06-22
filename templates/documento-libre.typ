// Plantilla "Documento libre" de PuduReport.
//
// El reporte mas abierto: portada, indice y las secciones del proyecto, nada
// mas. Sin tabla de hallazgos, sin scaffold fijo: sirve para documentar lo que
// sea (metodologia, notas de investigacion, runbooks, actas). El usuario crea
// las secciones que necesite en la pestaña Reporte y aqui se renderizan tal cual.
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

#let cover() = {
  align(left + horizon)[
    #if logo != "" and cover-show-logo [#image(logo, width: 4cm)#v(1cm)]
    #text(size: 30pt, weight: "bold", fill: brand, project.name)
    #if cover-show-accent [#v(0.25cm)#line(length: 30%, stroke: 1pt + brand)]
    #v(0.25cm)
    #text(size: 14pt, fill: gray, project.client)
    #if cover-subtitle != "" [#v(0.25cm)#text(size: 12pt, fill: brand, cover-subtitle)]
    #if org-line != none and cover-show-org [#v(0.25cm)#text(size: 11pt, fill: gray, org-line)]
    #if cover-show-period [#v(0.6cm)#text(size: 10.5pt, fill: gray)[#project.start_date — #project.end_date]]
  ]
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

#let render-block(b) = {
  if b.enabled {
    let k = b.kind
    if k == "cover" { cover() } else if k == "toc" { block-toc() } else if k == "section" {
      block-section(b.at("config", default: (:)).at("key", default: none))
    } else if k == "text" { block-text(b) } else if k == "pagebreak" { pagebreak() }
  }
}

#for b in project.layout { render-block(b) }
