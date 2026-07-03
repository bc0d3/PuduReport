# TAGS.md — vocabulario de tags de plantillas PDF

Los `tags` de cada `*.meta.yaml` son en su mayoria texto libre: solo alimentan
el buscador de la libreria de plantillas (`TemplateLibrary.tsx`). No hay un
enum que los valide — una plantilla de usuario puede usar cualquier palabra —
pero dos valores son funcionales y no deberian reutilizarse para otra cosa.

## Reservados (no usar salvo que sea la intencion)

`derive_family_from_tags` en `src-tauri/src/lib.rs` deriva la familia de
render de la plantilla a partir de los tags:

- `retest` — arma el reporte como retest (resumen por estado de
  remediacion, hallazgos agrupados por verificado/nuevo).
- `narrative` — reporte sin tabla de hallazgos, solo prosa.

Cualquier otra palabra en `tags` es puramente descriptiva.

## Convencion sugerida (documentacion, no un tipo validado)

Para mantener la busqueda util, conviene elegir tags de estos ejes segun
corresponda:

- **Tipo de engagement**: `web`, `infra`, `red-team`, `ctf`.
- **Registro del reporte**: `certificacion`, `examen`, `gestion`,
  `cumplimiento`.
- **Dominio**: `dfir`, `cti`, `threat-intel`, `incidente`.
- **Rol dentro del ciclo de vida**: `retest`, `remediacion`, `verificacion`.

Las 8 plantillas builtin ya siguen esta convencion (ver sus `*.meta.yaml`).
