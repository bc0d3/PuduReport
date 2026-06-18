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

// --- Portada minimalista ---
#let logo = ws.branding.logo_path
#align(left + horizon)[
  #if logo != "" [#image(logo, width: 4cm)#v(1cm)]
  #text(size: 30pt, weight: "bold", fill: brand, project.name)
  #v(0.25cm)
  #line(length: 30%, stroke: 1pt + brand)
  #v(0.25cm)
  #text(size: 14pt, fill: gray, project.client)
  #if org-line != none [#v(0.25cm)#text(size: 11pt, fill: gray, org-line)]
  #v(0.6cm)
  #text(size: 10.5pt, fill: gray)[#project.start_date — #project.end_date]
]
#pagebreak()

// --- Indice de contenidos ---
#if project.sections.any(s => s.body.trim() != "") {
  outline(title: [Indice de contenidos], depth: 2, indent: 1em)
  pagebreak()
}

// --- Secciones de prosa (todo el contenido) ---
#for section in project.sections {
  if section.body.trim() != "" {
    heading(level: 1, numbering: none, section.title)
    {
      set heading(outlined: false)
      eval(section.body, mode: "markup")
    }
  }
}
