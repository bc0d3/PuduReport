# Changelog

Todo cambio notable se documenta en este archivo. El formato sigue Keep a Changelog (https://keepachangelog.com) y el versionado sigue SemVer (https://semver.org).

## [0.0.10] - 2026-06-24

### Added
- Export de resumen de hallazgos a CSV con selector de columnas (numero, titulo, severidad, CVSS, CWE, estado, afectados, nuevo). Desde Vista previa PDF, el boton "Exportar CSV" abre el selector y salen solo las columnas elegidas. Es una tabla sin el detalle (cuerpo/PoC), en UTF-8 con BOM para que Excel muestre bien los acentos, y excluye los hallazgos ocultos. Util para compartir un panorama rapido, por ejemplo por correo.
- Menu de acciones por hallazgo en la lista (boton de tres puntos): Ocultar/Mostrar en el PDF, Copiar (duplica el hallazgo clonando sus campos y cuerpo) y Eliminar con confirmacion. Reemplaza al icono de ojo y deja lugar para mas opciones.

### Fixed
- Windows: ya no aparece la consola que parpadeaba y robaba el foco cada vez que se compila el PDF (tanto al exportar como en la vista previa en vivo). Se suprime con CREATE_NO_WINDOW al lanzar el sidecar de Typst. El mismo arreglo aplica al conectar el MCP por CLI.

## [0.0.9] - 2026-06-23

### Added
- Ocultar hallazgos del PDF con un icono de ojo en la lista. Un hallazgo oculto no aparece en las tablas, el indice ni el detalle, y no cuenta en los resumenes de severidad ni de estado. Sigue en disco; es un interruptor de inclusion, independiente del estado.
- Hallazgos nuevos en un retest. Un hallazgo se puede marcar como nuevo detectado en la verificacion (solo en reportes de familia retest); la plantilla retest los muestra en una seccion aparte, separados de los hallazgos verificados, tanto en el indice como en el detalle.
- Boton "Ordenar para retest" en la lista de hallazgos: ordena por estado de remediacion (abierto, no se corregira, aceptado, corregido) y, dentro de cada estado, por severidad. Aparece en reportes de familia retest en vez del orden por severidad.
- Tipo de reporte editable desde Reporte > Datos del proyecto, sin perder contenido.
- Editor de plantilla propia con un formulario simple (titulo, descripcion y tags editables) y el codigo Typst en una seccion avanzada plegable, para no tener que tocar codigo. El buscador de plantillas ahora filtra tambien por tags.
- Borrar plantillas de la libreria (no las incluidas) y confirmacion antes de duplicar, para no llenarse de copias por error.
- Subir imagenes al proyecto desde el servidor MCP (upload_asset) para ilustrar el reporte: la IA del usuario sube una captura y la referencia en el cuerpo. Solo escribe imagenes nuevas; nunca lee evidencias existentes.

### Changed
- La familia de render del reporte (hallazgos, retest o narrativo) se define con un tag de la plantilla: "retest" activa el orden por estado y la seccion de nuevos, "narrative" deja el reporte sin tabla de hallazgos. Un solo concepto en vez de un campo aparte. Los tags de las plantillas base se recortaron a un set minimo.

### Fixed
- La etiqueta del estado "No corregido" pasa a "No se corregira" en el resumen por estado de la plantilla retest, coherente con el resto de la app.
- Al borrar una plantilla de la libreria se limpia su uso como override en todos los proyectos que la tenian, evitando una referencia colgante que rompia la generacion del PDF.

### Security
- La subida de imagenes por MCP (upload_asset) genera el nombre del archivo en el servidor (UUID), asi la IA no controla el nombre y se eliminan por construccion el path traversal y la sobrescritura de evidencias. Acepta solo imagenes rasterizadas (png/jpg/jpeg/gif/webp; SVG excluido por scripts/XXE), exige que el proyecto exista y limita el tamano con un pre-chequeo del base64. El consentimiento al conectar el MCP advierte que, con un modelo en la nube, la imagen ya paso por la nube al verla; para NDA estricto, modelo local.

## [0.0.8] - 2026-06-22

### Added
- Lienzo libre de portada (disposicion "Lienzo"). En Portada y marca, ademas de las cuatro disposiciones predefinidas, se puede armar la portada como un lienzo: arrastrar logo, titulo, cliente, subtitulo, periodo, textos libres e imagenes a cualquier posicion, con tiradores para redimensionar y un panel para ajustar tamano de fuente, alineacion, color y negrita. Se renderiza en el PDF con posicionamiento absoluto. Aplica a pentest, red team, informe ejecutivo, documento libre, retest y HTB. Es opcional: las cuatro disposiciones siguen igual.
- Editor de bloques del cuerpo del reporte con vista previa en vivo. En la pantalla Reporte, el cuerpo del PDF (portada, indice, informacion del proyecto, resumen de severidades, indice de hallazgos, secciones y hallazgos) es una lista de bloques que se reordena arrastrando y se activa u oculta individualmente; se pueden insertar bloques de texto libre y saltos de pagina, con un panel que recompila el PDF al guardar. Aplica a pentest, red team, informe ejecutivo, documento libre, retest y HTB; el examen OSCP conserva su estructura fija. Los reportes existentes salen identicos: el orden de los bloques se sintetiza al abrirlos.
- Editor visual de plantillas (primer corte: elementos de la portada). Desde Portada y marca se puede mostrar u ocultar el logo, el periodo (fechas), la linea de gerencia/area y la linea de acento, y agregar un subtitulo libre, todo con vista previa en vivo y sin tocar la plantilla. Aplica a las plantillas con portada configurable (pentest, ejecutivo, htb, documento libre y retest); el examen OSCP conserva su portada de formato fijo. Los reportes existentes no cambian: los elementos arrancan visibles por defecto.
- Color de la portada independiente del color del reporte. Un selector de color de portada que tine el texto de la portada (titulo, cliente, gerencia/area, subtitulo y fechas) y sus lineas/acentos, sin afectar el cuerpo del reporte. Vacio = usa el color del reporte. Sirve, por ejemplo, para un titulo de portada de otro color o blanco sobre un fondo.
- Ordenar hallazgos por severidad con un boton (criticos primero), ademas del orden manual por arrastre. El orden vale para cualquier plantilla.
- El indice de hallazgos de pentest y HTB suma la columna Estado, para ver de un vistazo como quedo cada hallazgo (abierto/corregido/aceptado/no se corregira); el retest ya lo tenia.
- El servidor MCP ahora sigue el workspace abierto en la app: en vez de quedar fijo al de la configuracion, lee el workspace abierto en el GUI en cada llamada, asi al cambiarlo lo refleja sin reconfigurar. Sigue acotado a un workspace por vez.

### Fixed
- Las portadas de los reportes de Retest y Documento libre ahora aplican la imagen de fondo configurada, igual que las demas plantillas. Antes la ignoraban.
- Los campos de Reporte > Datos del proyecto ya no se desbordan de su recuadro (sobre todo los selectores de fecha) en ventanas angostas.

## [0.0.7] - 2026-06-20

### Added
- Dashboard en la pantalla de Inicio: al abrir el workspace se ve un resumen del trabajo (total de proyectos y hallazgos, distribucion por severidad, y el desglose por proyecto con su conteo por severidad). Un clic en un proyecto lo abre.
- La integracion MCP ahora permite conectar el servidor de PuduReport a mas de un cliente de IA local (instalar y desconectar por cliente desde Ajustes), para que tu asistente lea y mejore el texto de los hallazgos. Todo local; las evidencias nunca se exponen.

### Security
- Se corrige una posible inyeccion de markup en la conversion de markdown a Typst: un bloque de codigo preparado podia cerrar el bloque y hacer que se evaluara codigo de plantilla al generar el PDF (confinado al workspace). Se neutraliza con un delimitador de longitud dinamica.
- La prosa con `//` ya no desaparece del PDF (Typst la tomaba como comentario).
- Hardening: validacion anti path-traversal consistente en la edicion de plantillas, apertura de archivos confinada al workspace, y actualizacion de la dependencia git2 (avisos RUSTSEC).

## [0.0.6] - 2026-06-18

### Added
- Servidor MCP (`pudureport-mcp`): permite que tu cliente de IA local lea los proyectos e hallazgos y mejore su texto, todo local por stdio sin que los datos salgan del equipo (las evidencias nunca se exponen). Boton para instalarlo en tu cliente desde Ajustes, con aviso de consentimiento y opcion de desconectar.
- Selector de CWE con los mas usados (ranking de HackerOne), buscable por numero, nombre o sigla (XSS, IDOR, SSRF...). Un hallazgo puede tener varios CWE.
- Campos opcionales Gerencia y Area del cliente, visibles en la portada del reporte.
- Vista de codigo markdown en el editor del reporte, con alternar entre Markdown y vista renderizada.

### Fixed
- "Guardar version" (commit git) y la creacion de un workspace no respondian en algunos casos: se reemplazo el dialogo nativo del sistema (poco confiable en la webview de la app) por uno propio.

### Security
- Auditoria de dependencias (cargo audit / RUSTSEC) en CI y autoevaluacion de seguridad del servidor MCP (ASVS + OWASP LLM Top 10), documentada en `docs/mcp-security-assessment.md`.

## [0.0.5] - 2026-06-18

### Added
- Aviso de responsabilidad (descargo legal) en el README y en la pantalla Ajustes: herramienta gratuita bajo GPL-3.0, sin garantia, responsabilidad del usuario.

### Changed
- La confirmacion al borrar hallazgos y proyectos ahora usa un dialogo del propio diseno en vez del cartel nativo del sistema.

## [0.0.4] - 2026-06-18

### Fixed
- En la app instalada no aparecia ninguna plantilla y la generacion de PDF fallaba: las plantillas empaquetadas se buscaban en la ruta equivocada del bundle. Ahora se resuelven correctamente (incluido el tema de color del codigo).

## [0.0.3] - 2026-06-18

### Added
- Tipo de proyecto elegido al crearlo (pentest, red team, examen OSCP, examen HTB, informe ejecutivo, documento libre, retest): define el formulario, el scaffold de secciones y la plantilla por defecto.
- Modo examen para OSCP/HTB: severidad cualitativa manual sin CVSS, campo OSID y nombre del PDF segun la convencion de submission (OSCP-OS-<OSID>-Exam-Report.pdf).
- Plantilla OSCP rediseniada al estilo OffSec (portada full-bleed, numeracion, header/footer).
- Nuevas plantillas: informe ejecutivo (sin hallazgos), documento libre y retest (estado de remediacion). Pentest unifica infraestructura y red team.
- Exportar tambien un informe ejecutivo secundario desde el mismo proyecto (checkbox al exportar).
- Pantalla de bienvenida estilo IDE: lista de workspaces recientes con buscador, nuevo/abrir y boton para cambiar de workspace.
- Editor de codigo enriquecido: bloques con resaltado de sintaxis y selector de lenguaje (HTTP, SQL, JavaScript, Bash, Python, etc.), mas opciones de formato (cita, linea divisoria, enlace).
- Bloques de codigo en el PDF con fondo oscuro, resaltado y etiqueta de lenguaje.
- Vista de Historial git por proyecto: cambios sin guardar y commits anteriores, con boton para guardar version.
- Borrar proyectos desde la tabla de Proyectos, con confirmacion; si se borra el proyecto activo la app pasa a otro.

### Changed
- La plantilla del PDF pasa a definirse por proyecto (derivada del tipo, con override por proyecto) en vez de a nivel workspace.
- Pestaña de plantillas como tabla en dos secciones (tu libreria / incluidas) con buscador.
- Menu lateral con icono y etiqueta de texto en cada item.

### Removed
- Plantillas bug-bounty e infraestructura (cubiertas por pentest y por el branding).

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
- Portada: subir logo e imagen de fondo por separado (file picker), con scrim configurable sobre la imagen y marca de agua con tamano/opacidad ajustables (la marca ya no se parte).
- Boton "Abrir PDF" / "Abrir carpeta" tras exportar (crate opener).
- Indice de contenidos (TOC con numeros de pagina) e indice de hallazgos por severidad; hallazgos numerados.
- Opcion "cada hallazgo en su propia hoja" (activada por defecto).
- Plantilla OSCP (estructura estilo examen), y plantillas Hack The Box y Red Team.
- Galeria de plantillas con buscador y filtro por tags; duplicar y editar plantillas (.typ) desde la app, con metadata por sidecar (titulo, descripcion, tags).

### Changed
- Escala de severidad y color de marca por defecto alineados al sistema de diseno, en la UI y en las plantillas PDF.
- Orden de secciones del hallazgo: Prueba de concepto antes de Remediacion.
- En el PDF: chip de CVSS coloreado por severidad, estado como chip de color, vector CVSS legible, e imagenes de evidencia centradas.

### Fixed
- WorkspaceMeta::default dejaba la plantilla activa vacia (el default de serde no aplica en memoria), lo que rompia la generacion de PDF en un workspace recien creado.
- El conversor markdown a Typst escapaba caracteres dentro de bloques de codigo; ahora el contenido raw se preserva literal.

### Removed

### Security
- Validacion anti path-traversal en ids de proyecto/hallazgo/plantilla y en la plantilla activa: se rechazan separadores y `..` para que ningun comando escriba o lea fuera de la carpeta del proyecto (defensa en profundidad ante workspaces de terceros).
- El protocolo asset: deja de exponer todo el disco (scope `**`): el scope estatico queda vacio y solo se habilita dinamicamente la carpeta del workspace abierto.