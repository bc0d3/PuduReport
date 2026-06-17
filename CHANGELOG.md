# Changelog

Todo cambio notable se documenta en este archivo. El formato sigue Keep a Changelog (https://keepachangelog.com) y el versionado sigue SemVer (https://semver.org).

## [0.0.1] - 2026-06-17

Primer beta.

### Added
- Definicion inicial de arquitectura y stack (Tauri v2, Rust, React/TS, Typst, SQLite).
- Modelo de datos local-first: workspace = carpeta, hallazgos en markdown con front-matter YAML.
- Scaffold completo Tauri v2: backend Rust (workspace, db, pdf, cvss, git, markdown) y frontend React/TS.
- Calculadora CVSS 3.1 y 4.0 con calculo en Rust validado contra la implementacion de referencia de FIRST.org; la severidad se deriva del vector.
- Editor de hallazgos: campos estructurados, editor markdown WYSIWYG (TipTap), sidebar reordenable con drag & drop y punto de severidad.
- Libreria de plantillas: hallazgos reutilizables con variables {{cliente}}/{{target}} y snippets de texto.
- Generacion de PDF via Typst con tres plantillas base (corporativo, bug-bounty, infra), portada configurable, color de marca y marca de agua "CONFIDENCIAL" por defecto.
- Indice SQLite de busqueda reconstruible desde los archivos.
- Integracion git (init/commit) sobre el workspace del usuario.
- Proyecto de ejemplo de un clic ("Cargar ejemplo"): reporte demo con secciones boilerplate y tres hallazgos genericos (SQLi, IDOR, cabeceras de seguridad), listo para exportar a PDF.
- Secciones de reporte por defecto con texto boilerplate generico (resumen, alcance, metodologia, conclusiones) para que el PDF nunca salga vacio.
- Sistema de diseno DESING.md aplicado a toda la UI: paleta neutra calida, modo claro y oscuro con toggle, tipografia Inter + JetBrains Mono y iconos Tabler (todo empaquetado, sin CDN).
- Rediseno de la UI segun el prototipo de referencia: navegacion por rail de iconos y pantallas Inicio, Proyectos, Hallazgos, Reporte, Plantillas, Portada, Vista previa PDF y Ajustes.
- Editor de hallazgos con secciones separadas (Descripcion, Impacto, Prueba de concepto, Remediacion); el cuerpo se sigue guardando como markdown unico con encabezados.
- Pantalla Reporte con estructura del PDF reordenable y secciones activables/desactivables, resumen de severidades y boilerplate reinsertables.
- Editor de portada y marca con vista en vivo (disposicion, logo, color de marca, marca de agua).
- Vista previa de PDF embebida: el reporte se renderiza a imagenes por pagina dentro de la app.
- Titulo de la ventana nativa con el nombre del workspace.
- Adjuntar evidencias: pegar o arrastrar imagenes en cualquier seccion del hallazgo las guarda en assets/ con nombre UUID y quedan como ![](assets/<uuid>.<ext>); se muestran en el editor (protocolo asset:) y en el PDF. Los archivos no-imagen se insertan como enlace.
- La Prueba de concepto pasa a ser markdown (estilo HackerOne: paso a paso con evidencia y bloques de codigo).
- Tamano de imagenes: tope automatico para que no se desborden (editor y PDF) y ancho manual por imagen (S/M/L) guardado en el alt (![60%](...)), respetado en el editor y en el PDF (#image width).

### Changed
- Escala de severidad y color de marca por defecto alineados al sistema de diseno, en la UI y en las plantillas PDF.

### Fixed
- WorkspaceMeta::default dejaba la plantilla activa vacia (el default de serde no aplica en memoria), lo que rompia la generacion de PDF en un workspace recien creado.
- El conversor markdown a Typst escapaba caracteres dentro de bloques de codigo; ahora el contenido raw se preserva literal.

### Removed

### Security
- Validacion anti path-traversal en ids de proyecto/hallazgo/plantilla y en la plantilla activa: se rechazan separadores y `..` para que ningun comando escriba o lea fuera de la carpeta del proyecto (defensa en profundidad ante workspaces de terceros).
- El protocolo asset: deja de exponer todo el disco (scope `**`): el scope estatico queda vacio y solo se habilita dinamicamente la carpeta del workspace abierto.