// Libreria de diseno compartida por las plantillas de PuduReport.
//
// Centraliza lo que es identico en las 8 plantillas builtin: colores y
// etiquetas de severidad/estado, chips, badges, resolucion de fuentes y el
// estilo de los bloques de codigo. Cada plantilla sigue definiendo su propia
// pagina, marca de agua, portada y encabezados: eso varia legitimamente
// entre plantillas y no se centraliza aca (ver oscp.typ para un ejemplo de
// encabezados intencionalmente distintos).
//
// Uso: #import "theme.typ": *
// El backend copia este archivo junto a report.typ al compilar, tanto para
// plantillas builtin como para overrides de usuario en library/templates.

// --- Colores y etiquetas de severidad ---
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
#let vector-chip(vec, mono-font) = box(
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

// --- Fuentes: la del branding primero, con respaldo del sistema para que el
// PDF siempre renderice aunque la fuente elegida no este instalada. ---
#let default-body-font(branding) = if branding.at("body_font", default: "") != "" {
  (branding.body_font, "Helvetica Neue", "Arial", "Liberation Sans")
} else {
  ("Helvetica Neue", "Arial", "Liberation Sans")
}
// La cadena termina en "DejaVu Sans Mono", que Typst trae embebida en su
// binario: garantiza una monoespaciada real en cualquier ambiente (macOS,
// Windows, Linux, CI) sin instalar fuentes. No usar el generico "monospace":
// Typst no lo resuelve y cae a una serif (codigo desalineado y feo).
#let default-mono-font(branding) = if branding.at("mono_font", default: "") != "" {
  (branding.mono_font, "JetBrains Mono", "Menlo", "Consolas", "DejaVu Sans Mono")
} else {
  ("JetBrains Mono", "Menlo", "Consolas", "DejaVu Sans Mono")
}

// --- Bloques de codigo: fondo oscuro con resaltado + etiqueta de lenguaje.
// Cada plantilla solo necesita el wiring:
//   #show raw.where(block: true): it => render-code-block(it)
#let render-code-block(it, font: default-mono-font((:)), size: 9pt) = block(
  width: 100%,
  fill: rgb("#1e1f24"),
  radius: 4pt,
  breakable: true,
  stroke: 0.5pt + rgb("#2c2d34"),
)[
  #if it.lang != none [
    #block(width: 100%, fill: rgb("#2c2d34"), inset: (x: 9pt, y: 3pt))[
      #text(size: 7pt, weight: "bold", fill: rgb("#9aa0aa"), tracking: 0.4pt, upper(it.lang))
    ]
  ]
  #block(inset: 10pt)[
    #set par(justify: false, leading: 0.65em)
    #set text(font: font, size: size, fill: rgb("#e6e6e6"))
    #it
  ]
]


// Base editorial. Una copia puede ajustar estos parametros sin duplicar reglas.
// No modifica datos ni impone el layout de un tipo de reporte a otro.
#let report-style(body-font, mono-font, body-size: 11pt, code-size: 9pt,
  leading: 0.7em, justify: false, body) = {
  set text(font: body-font, size: body-size, lang: "es", hyphenate: false)
  set par(justify: justify, leading: leading, spacing: 0.8em)
  set list(spacing: 0.45em)
  set enum(spacing: 0.45em)
  set table(inset: (x: 7pt, y: 6pt), stroke: 0.5pt + luma(215))
  show table: set text(size: 9.5pt)
  show table: set par(justify: false, leading: 0.6em)
  show table.cell.where(y: 0): set text(weight: "bold")
  show raw: set text(font: mono-font, size: 1em)
  show raw.where(block: false): set text(size: 0.92em)
  set raw(theme: "code-dark.tmTheme")
  show raw.where(block: true): it => render-code-block(it, font: mono-font, size: code-size)
  body
}

// Fechas opcionales: nunca imprimir un guion aislado ni inventar un periodo.
#let report-period(project) = {
  let start = project.start_date.trim()
  let end = project.end_date.trim()
  if start != "" and end != "" { start + " — " + end }
  else if start != "" { "Desde " + start }
  else if end != "" { "Hasta " + end }
  else { "" }
}

#let project-info(project) = {
  let cells = ()
  if project.client.trim() != "" { cells += ([*Cliente:*], project.client) }
  if report-period(project) != "" { cells += ([*Periodo:*], report-period(project)) }
  if project.team.len() > 0 {
    cells += ([*Equipo:*], project.team.map(m => {
      if m.role.trim() == "" { m.name } else { m.name + " (" + m.role + ")" }
    }).join(", "))
  }
  if cells.len() > 0 { grid(columns: (auto, 1fr), row-gutter: 6pt, column-gutter: 12pt, ..cells) }
}

// Activos son texto libre, no siempre IPs: conservar su tipografia y legibilidad.
#let affected-assets(items, label: "Activos afectados") = if items.len() > 0 {
  block(above: 8pt, below: 8pt)[
    #text(weight: "bold", label + ":")
    #set text(size: 10pt)
    #set par(justify: false)
    #list(..items)
  ]
}

// --- Parte ejecutiva (informe de ethical hacking) ---
// Bloques del layout "root_causes", "business_risks", "findings_impact" y
// "remediation_plan". Reciben el data.json completo y no renderizan nada si
// el proyecto no tiene los datos que muestran. Los textos llegan como texto
// plano (no markup): se insertan como string, nunca con eval. Los numeros de
// hallazgo son los mismos del indice y del detalle.

#let priority-color = (
  inmediata: rgb("#a32d2d"),
  corto: rgb("#c2410c"),
  mediano: rgb("#ba7517"),
  cierre: rgb("#639922"),
)

// Lista de numeros de hallazgo: "1, 3, 4".
#let finding-numbers(nums) = nums.map(n => str(n)).join(", ")

// Celda vacia de las tablas ejecutivas.
#let empty-cell = text(fill: luma(150), "—")

#let priority-chip(a) = {
  if a.prioridad == "" { empty-cell } else {
    let color = priority-color.at(a.prioridad, default: rgb("#78716c"))
    box(
      inset: (x: 6pt, y: 2pt),
      radius: 3pt,
      stroke: 0.7pt + color,
      text(size: 8pt, weight: "bold", fill: color, upper(a.prioridad_label)),
    )
  }
}

#let block-root-causes(data) = {
  let items = data.project.at("causas_raiz", default: ())
  if items.len() > 0 {
    v(0.5cm)
    heading(numbering: none)[Causas raiz]
    for (i, c) in items.enumerate() {
      block(breakable: false, above: 10pt, below: 8pt, width: 100%, inset: (left: 10pt), stroke: (left: 2pt + luma(200)))[
        #text(weight: "bold", str(i + 1) + ". " + c.titulo)
        #if c.hallazgos.len() > 0 [
          #h(6pt)
          #text(size: 9pt, fill: luma(90))[Hallazgos N° #finding-numbers(c.hallazgos)]
        ]
        #if c.descripcion != "" [
          #block(above: 5pt, text(size: 10pt, c.descripcion))
        ]
      ]
    }
  }
}

#let block-business-risks(data) = {
  let groups = data.at("riesgos_negocio", default: ())
  if groups.len() > 0 {
    v(0.5cm)
    heading(numbering: none)[Riesgos para el negocio]
    for g in groups {
      block(above: 12pt, below: 4pt, sticky: true, text(weight: "bold", size: 11pt, g.etiqueta))
      for f in g.hallazgos {
        block(breakable: false, above: 6pt, below: 6pt, width: 100%, inset: (left: 10pt))[
          #badge(sev-label.at(f.severity, default: f.severity), sev-color.at(f.severity, default: sev-color.info))
          #h(4pt)
          #text(weight: "bold", str(f.number) + ". " + f.title)
          #if f.impacto_negocio != "" [
            #block(above: 4pt, text(size: 10pt, f.impacto_negocio))
          ]
        ]
      }
    }
  }
}

#let block-findings-impact(data) = {
  let rows = data.findings
  let has-data = rows.any(f => f.at("modulo", default: "") != "" or f.at("impacto_negocio", default: "") != "")
  if has-data {
    v(0.5cm)
    heading(numbering: none)[Hallazgos e impacto para el negocio]
    table(
      columns: (auto, 1.3fr, 0.8fr, auto, 2fr),
      align: (center + horizon, left + horizon, left + horizon, center + horizon, left + horizon),
      stroke: 0.5pt + luma(220),
      table.header([N°], [Hallazgo], [Modulo], [Severidad], [Impacto para el negocio]),
      ..rows.map(f => {
        let modulo = f.at("modulo", default: "")
        let impacto = f.at("impacto_negocio", default: "")
        (
          str(f.at("number", default: 0)),
          f.title,
          if modulo != "" { modulo } else { empty-cell },
          badge(sev-label.at(f.severity, default: f.severity), sev-color.at(f.severity, default: sev-color.info)),
          if impacto != "" { impacto } else { empty-cell },
        )
      }).flatten(),
    )
  }
}

#let block-remediation-plan(data) = {
  let items = data.project.at("plan_remediacion", default: ())
  if items.len() > 0 {
    v(0.5cm)
    heading(numbering: none)[Plan de remediacion priorizado]
    table(
      columns: (auto, 2fr, auto, 1fr),
      align: (center + horizon, left + horizon, center + horizon, left + horizon),
      stroke: 0.5pt + luma(220),
      table.header([Prioridad], [Accion], [Cierra N°], [Responsable]),
      ..items.map(a => (
        priority-chip(a),
        a.accion,
        if a.hallazgos.len() > 0 { finding-numbers(a.hallazgos) } else { empty-cell },
        if a.responsable != "" { a.responsable } else { empty-cell },
      )).flatten(),
    )
  }
}

// Despacho de los bloques ejecutivos. Devuelve none si el kind no es uno de
// ellos, asi cada plantilla lo agrega a su render-block sin duplicar codigo.
#let executive-block(kind, data) = {
  if kind == "root_causes" { block-root-causes(data) } else if kind == "business_risks" {
    block-business-risks(data)
  } else if kind == "findings_impact" { block-findings-impact(data) } else if kind == "remediation_plan" {
    block-remediation-plan(data)
  }
}
