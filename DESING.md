# DESIGN.md — PuduReport

Sistema de diseno de la aplicacion. Define la identidad visual para que toda la UI salga coherente. Implementar como CSS custom properties (o mapear a Tailwind theme).

## Filosofia visual

Calmo, calido y denso pero ordenado. Estetica de app de escritorio nativa, no de pagina web: poco cromo, bordes sutiles, sin sombras pesadas, mucho contenido legible. Base neutra calida (no gris frio), un solo color de acento, y una escala de severidad semantica fija. Soporta modo claro y oscuro (el oscuro importa: el publico trabaja de noche).

## Tokens de color

### Modo claro

```css
:root {
  --bg-app:        #FAF9F5; /* fondo de ventana */
  --bg-panel:      #F0EEE6; /* sidebar, superficies secundarias */
  --bg-elevated:   #FFFFFF; /* cards, inputs */
  --bg-subtle:     #E9E6DC; /* hover, separadores suaves */
  --text-primary:  #1A1A17;
  --text-secondary:#55534C;
  --text-muted:    #8B887E;
  --border:        #E2DFD4; /* 0.5-1px */
  --border-strong: #CFCBBE;
  --accent:        #1F6FB2; /* info y accion primaria */
  --accent-bg:     #E7F0F8; /* fondo de resaltado info */
}
```

### Modo oscuro

```css
.dark {
  --bg-app:        #1C1B18;
  --bg-panel:      #25241F;
  --bg-elevated:   #2E2C27;
  --bg-subtle:     #35332D;
  --text-primary:  #ECE9DF;
  --text-secondary:#ADA99F;
  --text-muted:    #7C7970;
  --border:        #38362F;
  --border-strong: #4A473F;
  --accent:        #5BA3DA;
  --accent-bg:     #1E3344;
}
```

## Escala de severidad (semantica, igual en ambos modos)

Color de relleno solido en badges, texto blanco encima. NO reusar para otra cosa.

```css
:root {
  --sev-critical: #A32D2D;
  --sev-high:     #C2410C;
  --sev-medium:   #BA7517;
  --sev-low:      #639922;
  --sev-info:     #78716C;
}
```

El punto de color en la lista de hallazgos usa estos mismos valores (circulo de 7px).

## Tipografia

- UI: Inter, system-ui, -apple-system, "Segoe UI", sans-serif.
- Monoespaciada: "JetBrains Mono", "SF Mono", ui-monospace, monospace. Para codigo, PoC y vectores CVSS.
- Tamano base 13-14px (densidad de escritorio). Titulos 16-22px.
- Pesos: 400 cuerpo, 500 enfasis y labels, 600 titulos. Evitar abuso de negrita.
- Labels de campo: 11px, color --text-muted.

## Forma y espaciado

- Radios: 6px controles, 8px cards, 12px paneles grandes.
- Bordes: 0.5-1px con --border. La estructura se define con borde, no con sombra.
- Sombras: minimas. Solo en overlays y popovers, muy suaves.
- Escala de espaciado: 4 / 8 / 12 / 16 / 24 px.
- Padding de paneles 12-18px. Items de lista 7-8px vertical.

## Iconos

Tabler Icons (clase ti ti-*). Tamano 15-18px, color --text-muted salvo activos (--accent). Sin emojis en ningun lado.

## Patrones de componente

- Sidebar: fondo --bg-panel. Item activo con fondo --accent-bg y texto --text-primary. Punto de severidad 7px a la izquierda. Grip de arrastre (ti-grip-vertical) en --text-muted.
- Card / superficie: --bg-elevated o --bg-panel, borde 0.5px --border, radio 8px.
- Campo de formulario: label 11px --text-muted arriba; input --bg-elevated, borde --border, radio 6px, padding 7-10px.
- Badge de severidad: relleno solido del color --sev-*, texto blanco, 9px, mayuscula, radio 4px, padding 8x/3y.
- Boton primario: fondo --accent, texto blanco, radio 6px. Secundario: --bg-panel + borde --border.
- Selector tipo tarjeta (plantillas, disposiciones): borde 0.5px en reposo, borde 2px --accent cuando esta seleccionado.

## Prompt reutilizable para componentes de UI

Pegar esto al pedir cualquier componente de UI nuevo:

---

Genera el componente en React + TypeScript siguiendo el sistema de diseno de PuduReport: estetica de app de escritorio nativa, calma y calida, poco cromo, densa pero ordenada. Usa solo los tokens CSS definidos en DESIGN.md (--bg-app, --bg-panel, --bg-elevated, --bg-subtle, --text-primary, --text-secondary, --text-muted, --border, --border-strong, --accent, --accent-bg) y la escala de severidad fija (--sev-critical #A32D2D, --sev-high #C2410C, --sev-medium #BA7517, --sev-low #639922, --sev-info #78716C). Tipografia Inter para UI y JetBrains Mono para codigo/vectores CVSS; base 13-14px, labels 11px en --text-muted, pesos 400/500/600 sin abusar de negrita. Radios 6px controles, 8px cards, 12px paneles. Estructura con bordes de 0.5-1px en --border, no con sombras (sombras solo en overlays). Espaciado 4/8/12/16/24. Iconos Tabler (ti ti-*) de 15-18px en --text-muted. Soporta modo claro y oscuro via la clase .dark. Sin emojis. Badges de severidad con relleno solido y texto blanco. Item de lista activo con fondo --accent-bg. Boton primario --accent con texto blanco, secundario --bg-panel con borde.

---
