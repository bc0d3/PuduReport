# CONTENT-STYLE.md — PuduReport

Guia de redaccion para el contenido de un hallazgo (Descripcion, Impacto,
Prueba de concepto, Remediacion) y de las secciones de prosa del reporte. No
cambia el esquema fijo de secciones (ver `src/lib/sections.ts`): esto es guia
de que decir dentro de cada seccion, no una estructura nueva.

## Idioma

Espanol neutro: sin regionalismos ni modismos de un pais en particular.
El texto tiene que entenderse tanto por una persona tecnica (que va a validar
el detalle) como por una no tecnica (que solo necesita entender el riesgo y
que hay que hacer). Eso no significa evitar terminos tecnicos donde
corresponden (CWE, CVSS, nombres de protocolos, nombres de parametros): se
usan con precision, pero explicando el concepto la primera vez que aparece si
no es evidente por contexto.

## Voz y tiempo verbal

- **Descripcion** e **Impacto**: impersonal, en presente o preterito segun
  corresponda a lo observado ("La aplicacion permite...", "Se identifico
  que..."). Evitar la primera persona ("encontre", "vi").
- **Prueba de concepto**: paso a paso, en infinitivo o imperativo
  ("Enviar la siguiente peticion...", "Observar la respuesta..."). Estilo
  cercano a un reporte de HackerOne: pasos reproducibles, con evidencia
  (capturas, bloques de codigo) intercalada.
- **Remediacion**: imperativo, orientado a la accion ("Validar el parametro
  en el servidor", "Aplicar un allowlist de dominios permitidos").

## Vocabulario de severidad e impacto

Usar siempre las etiquetas fijas de severidad (`Critica`, `Alta`, `Media`,
`Baja`, `Informativa` — las mismas de `sev-label` en `templates/theme.typ` y
de `--sev-*` en `DESING.md`). No usar calificativos subjetivos sueltos
("gravisimo", "super riesgoso"): la severidad ya esta comunicada por el
badge; el texto describe el impacto concreto (que puede hacer un atacante,
que dato o funcion se compromete), no un adjetivo.

## Referencias CWE y CVSS

- CWE siempre como `CWE-XXX: Nombre` (ej. `CWE-89: SQL Injection`), no solo
  el numero.
- El vector CVSS se muestra completo (ya se renderiza como chip mono en el
  PDF, ver `vector-chip` en `templates/theme.typ`); no resumir el vector en
  prosa, dejar que el chip lo muestre y usar el texto para explicar que
  significa la puntuacion en terminos de riesgo real.

## Bloques de codigo / evidencia

Todo bloque de codigo o captura de una peticion/respuesta HTTP va en un
bloque de codigo con etiqueta de lenguaje (` ```http `, ` ```sql `, etc.): el
render de PDF (`render-code-block` en `templates/theme.typ`) muestra esa
etiqueta como cabecera del bloque, asi que un bloque sin lenguaje pierde esa
referencia visual. Evidencia de otro tipo (capturas de pantalla) se
referencia como imagen en el paso donde corresponde, no al final.

## Donde se aplica

Esta guia es la referencia para:
- Las 29 plantillas de hallazgos builtin (`templates/finding-templates/*.md`).
- Cualquier plantilla o snippet nuevo que se agregue a la libreria de un
  workspace.
