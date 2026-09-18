# PuduReport — sistema visual V2

Fuente vigente para la UI. Evoluciona el sistema original conservado en
[DESING.md](DESING.md). CLAUDE.md sigue siendo la fuente de verdad arquitectonica.
Esta migracion modifica presentacion y navegacion; conserva Tauri v2, React,
TypeScript, Rust, Typst y los contratos de archivos e IPC.

## Reconnaissance y alcance

Revision inicial: Git limpio, rama `dev` con un commit por delante del remoto;
AGENTS.md vacio. El documento visual existente se llamaba DESING.md.

- `App.tsx` mantiene workspace, proyecto activo, tema y vista mediante estado
  React; no hay router ni store global. `ToastProvider` aporta notificaciones.
- El launcher abre carpetas locales. Inicio y Proyectos comparten `Projects`,
  con dashboard, tabla y Kanban. El proyecto seleccionado determina el editor.
- `FindingEditor` compone `Sidebar`, TipTap/MarkdownEditor, CVSS y CWE; conserva
  ocultacion, duplicado, eliminacion y orden manual/por severidad/por retest.
- `ContentEditor` atiende las plantillas de markdown libre. La plantilla
  efectiva, incluidos overrides, determina la familia del editor.
- `ReportBuilder` edita datos, secciones y bloques con orden y visibilidad;
  `LivePreview` compila con Typst despues de guardar. OSCP conserva su flujo fijo.
- `TemplateLibrary` contiene PDF, hallazgos y snippets, con duplicacion,
  variables, edicion y aplicacion al proyecto. Aplicar PDF tiene alcance de
  proyecto aunque la biblioteca sea global al workspace.
- Portada y marca editan branding del workspace, incluido el lienzo existente.
  `PdfPreview` conserva exportacion PDF/CSV/API con consentimiento.
- Ajustes administra tema, marca de agua, Git y conexiones MCP existentes.
  Historial consulta Git. MCP y tipos CTI/DFIR ya estan implementados aunque
  partes de CLAUDE.md aun los describan como futuros; no se eliminan.
- `lib/api.ts` encapsula invoke; `src-tauri` expone comandos y usa `core` para
  modelos/I/O/CVSS. Archivos YAML/Markdown son la verdad; SQLite es un indice.
- Los estilos son CSS global mas estilos inline. Ya existen botones, campos,
  badges, listas, Modal, confirmaciones, Toast e iconografia Tabler reutilizables.

Deuda encontrada: rail que mezcla alcances; proyecto activo poco visible;
seleccion de proyecto alejada del trabajo; falta de paleta/foco consistente;
listas clicables con acceso por teclado incompleto; grillas rigidas que restan
espacio al editor; overlays sin gestion de foco; tokens incompletos y valores
inline; abundancia de cards en pantallas de configuracion. Cargas asincronas
podian mostrar metadata de un proyecto anterior.

Riesgos de una migracion: desmontar editores con autoguardado pendiente,
alterar identidad/keys de hallazgos, perder drag & drop, confundir branding
compartido con plantilla por proyecto, ignorar familias de reporte o hacer
exportaciones sin consentimiento. No mover persistencia al shell ni convertir
SQLite en store de UI. No indicar "Guardado" sin confirmacion real del backend.

## Arquitectura visual

1. Rail global de 72 px: Inicio, Proyectos, Plantillas, Marca, Workspace, Tema,
   Ajustes. Los colores de severidad nunca identifican secciones de navegacion.
2. Barra superior de 48 px: workspace, contexto y acceso a comandos.
3. Sidebar contextual de 212 px: herramientas Hallazgos o Contenido, Reporte,
   Vista previa e Historial. Visible dentro del proyecto y en Plantillas con
   contexto activo; oculta en el tablero y demas vistas globales. Sin selector
   desplegable: los proyectos se abren desde el tablero o la paleta.
4. Area principal flexible: conserva las vistas, sus callbacks y sus editores.
   La lista de hallazgos y la estructura del reporte pertenecen a sus vistas.
5. Panel derecho solo cuando aporta informacion real: vista previa de Typst en
   ReportBuilder, ocultable. Por debajo de 1050 px de contenido pasa debajo del
   editor; por debajo de 760 px, la estructura pasa arriba. No hay inspector
   universal vacio ni una cuarta columna permanente.

La paleta y la navegacion comparten `src/lib/navigation.ts`. No se introduce un
router para una app que ya usa vistas en memoria. AppShell maneja unicamente
estado efimero de presentacion, no archivos, saves ni IPC.

## Tokens y primitives

`src/styles/tokens.css` es la implementacion de referencia. `styles.css` conserva
las clases existentes; los alias antiguos siguen funcionando durante la migracion.

| Rol | Claro | Oscuro |
| --- | --- | --- |
| Rail | #e9e7e0 | #15171b |
| Area de trabajo | #faf9f5 | #191b1f |
| Panel | #f0eee6 | #202328 |
| Superficie elevada | #ffffff | #272b31 |
| Hover | #e9e6dc | #30353d |
| Texto principal | #1a1a17 | #edf0f4 |
| Texto secundario | #55534c | #b4bbc5 |
| Texto auxiliar | #716e65 | #929ba8 |
| Borde | #e2dfd4 | #343941 |
| Acento de texto/foco | #1f6fb2 | #78b7ed |
| Accion primaria solida | #1f6fb2 | #286fae |

El acento solido se separa del acento de texto para mantener legibilidad del
texto blanco. Severidades conservan sus tokens y significado existentes.
Errores y acciones destructivas usan `--danger`, nunca clases de severidad.

Inter 13–14 px para UI; JetBrains Mono para codigo y vectores. Fuentes e iconos
Tabler se empaquetan offline. Espaciado: 4, 8, 12, 16, 24 px. Radio: controles
6 px, paneles/cards 8 px. Estructura con bordes discretos; sombra solo en overlays.
Sin gradients decorativos, colores hacker, iconos multicolor ni cards anidadas
para representar cada campo. Mantener tema claro y preferencias del usuario.

Reutilizar `.btn`, `.icon-btn`, `.input`, `.select`, `.field`, `Severity`,
`Modal`, `Sidebar` y `Toast` antes de crear variantes. Nuevo estado de pantalla:
icono neutro, titulo concreto, explicacion y accion de recuperacion cuando
corresponda. No presentar un error de carga como lista vacia.

## Interaccion y accesibilidad

- Foco visible en controles; hover y seleccion separados. Navegacion con
  `aria-current`, controles de panel con `aria-expanded` y nombre accesible.
- Tooltips propios mediante `HintButton` en rail y control de sidebar: demora
  de 350 ms con cursor, inmediatos al enfocar con teclado, cierre con Escape,
  limites de ventana y ayuda accesible. Las vistas aun no migradas conservan
  `title`. Mantener etiquetas visibles; no comunicar acciones solo con color.
- Cmd/Ctrl+K abre comandos desde el workspace. Flechas recorren resultados,
  Enter ejecuta, Escape cierra. Se busca sin distincion de acentos.
- Cmd/Ctrl+B alterna sidebar fuera de campos editables; dentro de TipTap conserva
  negrita. Atajos globales no atraviesan dialogs ni popovers abiertos.
- `Modal` utiliza dialog nativo para foco contenido, Escape, fondo inerte y
  restauracion del foco. Paleta reutiliza esta primitive; no instala dependencias.
- Los resultados de comandos solo navegan o cambian apariencia; acciones
  destructivas y exportacion externa conservan sus confirmaciones existentes.
- Toast usa status/alert. Respetar prefers-reduced-motion.

## Plan incremental y archivos

Primer incremento implementado:

- Tokens: nuevo `src/styles/tokens.css`; adaptar `src/styles.css` con aliases,
  estados compartidos, shell, dialog y grillas sensibles al ancho disponible.
- Primitives: evolucionar `src/components/Modal.tsx`, `Toast.tsx` y `Sidebar.tsx`.
- Shell/navegacion: nuevos `src/components/AppShell.tsx`, `CommandPalette.tsx`,
  `src/lib/navigation.ts`; integrar en `src/App.tsx` y reducir `Rail.tsx` al alcance
  global. Proteger cargas tardias de metadata y dar reintento de carga.
- Primera vista: adaptar `src/views/ReportBuilder.tsx` con preview ocultable y
  layout flexible, preservando formularios, bloques, export y render real.
- Documentacion: este archivo, referencia historica en DESING.md y enlace en
  README.dev.md. ESLint declara los tipos DOM utilizados por las primitives.

Siguientes incrementos, separados para poder revisar cada flujo:

1. Autoguardado: estado confirmado por entidad, flush al navegar y pruebas de
   cambio rapido entre hallazgos/proyectos. Actualmente sigue en cada editor.
2. FindingEditor: evaluar inspector de metadata sin esconder CVSS/CWE ni
   sacrificar escritura, accesibilidad de calculadora y reordenamiento por teclado.
3. TemplateLibrary: edicion en panel contextual para tareas largas; dejar
   confirmaciones y captura breve de variables en dialog.
4. Ajustes/Marca: agrupar por secciones con separadores; migrar cards e inline
   styles gradualmente. Proyectos conserva tabla y Kanban.
5. Generalizar estados loading/empty/error con recuperacion en cada vista;
   navegacion con historial solo si los flujos reales lo necesitan.

## Validacion

Revisar lint, TypeScript/build, fmt, clippy y tests de Rust. El workspace Rust
incluye core y MCP: ejecutar tambien tests de core si se quiere cubrir CVSS y
parseo (no viven todos en src-tauri). La validacion de navegador con IPC simulado
no reemplaza la prueba nativa de Tauri, archivos, sidecars, export ni keychain.

Revision manual para cada entrega: 960x640, 1280x820 y pantalla amplia; claro y
oscuro; teclado y foco de dialogs; proyectos sin hallazgos, OSCP, retest y
markdown libre; autoguardado al navegar; PDF/CSV y consentimiento de API/MCP.

### Resultado del primer incremento (2026-09-17)

- `npm run lint`: sin errores ni warnings.
- `npm run build`: TypeScript y Vite correctos; aviso de chunk JS mayor a 500 kB.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: correcto.
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`: correcto.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 17 tests correctos.
- `cargo test -p pudureport-core`: 57 tests correctos.
- Test `generate_pdf_end_to_end` repetido con `PUDU_TYPST_BIN` apuntando al
  sidecar local: correcto, sin omitir la compilacion por falta de Typst.
- Chromium/Playwright con IPC simulado: paleta con busqueda, Enter y Escape;
  restauracion y ciclo de foco; atajos bloqueados durante dialogos; navegacion
  pentest, CTI, OSCP y retest; carga fallida y reintento; tema claro/oscuro;
  acceso a Plantillas y Ajustes. Editor sin desborde horizontal a 960 px y
  ReportBuilder a 960, 1280 y 1680 px; ocultar/mostrar preview correcto.
- Revision de capturas de editor y reporte; `git diff --check` y Prettier sobre
  los archivos frontend modificados correctos.

No se ejecutaron instaladores ni una sesion interactiva nativa de Tauri en
macOS/Windows/Linux. La prueba de navegador usa datos ficticios y no valida
keychain, dialogs del SO ni escritura real mediante IPC.

### Segundo incremento: acabado e interaccion

- `styles/workbench.css` concentra el acabado progresivo: transiciones de
  120–180 ms, respuesta al presionar, jerarquia de cabeceras, listas y editor.
  Se respeta reduced-motion. La sidebar se contrae sin desmontar editores;
  mientras esta oculta queda fuera del foco mediante inert.
- Hallazgos incluye busqueda local, titulos de dos lineas, severidad y estado.
  El filtro no modifica el orden persistido; se desactiva arrastre al filtrar.
- El launcher conserva abrir/crear/recientes y utiliza un unico acento.
- Portada conserva todas las disposiciones. El lienzo existente suma zoom
  75–150%, guias visuales, seleccion desde capas y movimiento con flechas
  (Shift multiplica el paso por diez). Supr/Backspace quitan el elemento con
  foco; no se interceptan dentro de campos de texto. No se agrega reordenamiento
  de capas ni se cambia su orden en el archivo.
- Zoom y guias son estado efimero; no cambian el PDF ni el esquema CoverElement.
  Drag y resize usan el ancho visible para conservar coordenadas normalizadas.
  Los botones de formato guardan el valor nuevo en una sola operacion.
- La grilla de portada se adapta al ancho de contenido. En espacios reducidos
  las propiedades pasan debajo de la hoja. Se conserva el aviso beta y el
  caracter ilustrativo de titulo, cliente y periodo.

Validacion: lint, build, fmt, clippy y 17 tests Tauri correctos. Chromium con IPC
simulado verifica navegacion/foco, filtro, sidebar oculta, reduced-motion,
zoom, arrastre y resize al 150%, alineacion guardada, guias y agregar/quitar texto.
Capturas revisadas a 960/1280/1680 px. El build conserva el aviso de bundle grande.
La app Tauri se mantiene en desarrollo para revision visual del usuario.

### Refinamiento de feedback

`HintButton.tsx` reutiliza botones nativos y crea ayudas fuera del contenedor
para evitar recortes del rail. Las ayudas permiten mover el cursor sobre ellas;
se descartan al activar, desenfocar, desplazar o cambiar de ventana. No usar
esta primitive dentro de dialogs nativos sin adaptar el destino de su portal.

El rail diferencia hover y seleccion con un indicador de altura variable. La
seccion de escritura enfocada gana contraste, y CVSS ahora es un boton accesible.
Las notificaciones tienen icono semantico y cierre, pausan al leerlas con cursor
o foco y cancelan temporizadores anteriores. Los errores duran ocho segundos.
La preview muestra un documento esquematico y actividad mientras compila;
conserva las paginas visibles durante actualizaciones, sin porcentajes ficticios.

Build, lint y pruebas Chromium con IPC simulado correctos tras este refinamiento;
se verificaron tambien tooltip, Escape y foco de escritura/CVSS. Los cambios
siguen respetando reduced-motion, sin dependencias nuevas ni cambios de archivos
del workspace. No se repitieron checks Rust en esta pasada solo de frontend.

### Inicio como tablero personal de trabajo

Inicio prioriza proyectos activos, fechas de cierre y acceso al trabajo. Reutiliza
`Dashboard`, `Projects`, los tipos existentes y los comandos `list_projects` y
`workspace_stats`. Mantiene debajo el resumen de hallazgos y su distribucion;
Proyectos conserva su Kanban, tabla, asignaciones y operaciones existentes.

- Filtros Activos, Proximos 7 dias (incluye hoy), Vencidos y Todos; busqueda por
  nombre, cliente o tipo. Los finalizados nunca se cuentan como vencidos.
- Tarjetas abren el proyecto; agenda lateral muestra los siguientes cinco
  cierres. Los reportes narrativos se identifican sin exigir hallazgos.
- Fechas tomadas del `project.yaml` existente. La barra indica **plazo
  transcurrido**, no porcentaje de revision. No se inventan tareas ni avances.
  Fechas ausentes, invalidas o invertidas tienen mensajes explicitos. Se calcula
  por dias calendario locales y se actualiza al recuperar foco y cada minuto.
- Movimiento breve al aparecer, hover/foco y pulsacion; un unico acento para
  navegacion y tiempo. Severidades conservan sus colores propios. La agenda
  pasa debajo al reducir ancho; se respeta movimiento reducido.
- Sin cambios de esquema, backend o dependencias. Logica temporal aislada en
  `src/lib/projectSchedule.ts`; pruebas con
  `node --test scripts/project-schedule.test.mjs` (TypeScript ya instalado).

Validacion del incremento: lint y build correctos (persiste aviso de bundle
mayor a 500 kB), fmt y clippy correctos, 17 tests Tauri y cuatro tests de fechas
correctos. Chromium con IPC simulado verifica filtros, busqueda, fechas,
exclusion de finalizados, apertura de reporte narrativo, acceso a Proyectos,
error/reintento y ausencia de overflow a 960/1280/1680 px. Tambien pasa el smoke
previo de editor, navegacion, portada y dialogs. La app Tauri sigue en desarrollo
para revisar visualmente con datos locales reales.

### Pestanas de proyectos

`App` conserva IDs abiertos y ultima vista de proyecto durante la sesion del
workspace. `AppShell` presenta una fila compacta bajo la barra superior, con
icono, nombre, cierre individual y acceso a Proyectos. Seleccionar de nuevo un
proyecto no duplica la pestana. Cerrar la activa abre una vecina; cerrar la ultima
vuelve a Proyectos. Cerrar pestanas nunca elimina archivos. Inicio y otras vistas
globales conservan las pestanas sin marcar una como contenido activo.

Se reutiliza `HintButton`, tokens e iconografia; no se agrega router ni libreria.
Flechas, Home y End desplazan el foco entre proyectos; Enter activa el boton.
La fila permite desplazamiento horizontal cuando no cabe y mantiene visible la
seleccion. La sesion de pestanas no se persiste en los archivos del workspace.

`pendingWrites.ts` agrupa autoguardado por archivo, captura el contenido al editar
un hallazgo y serializa escrituras. Hallazgos, Contenido y Reporte lo utilizan.
La navegacion del shell y el cierre de pestanas/workspace esperan confirmacion
del backend. Un fallo conserva el borrador pendiente y bloquea esa navegacion;
volver a intentarla reintenta el guardado. No es recuperacion tras un cierre
forzado del proceso ni persistencia de borradores en disco. Las revisiones de
hallazgos impiden que una respuesta antigua reemplace una edicion mas reciente.

Checks: lint, build (aviso existente de bundle), fmt, clippy y tests Rust.
`node --test scripts/pending-writes.test.mjs scripts/project-schedule.test.mjs`
verifica siete casos de agrupacion, serializacion, reintento y fechas. Pruebas
Chromium con IPC simulado cubren apertura/cierre sin borrar, ausencia de
pestanas duplicadas, ultima seccion, guardado antes de cambiar, fallo/reintento,
teclado y anchos 960/1280/1680. Tambien pasa la regresion previa de editores,
reportes, portada y dialogs. Las vistas se recargan al cambiar de proyecto;
no se promete conservar posicion de cursor o scroll de cada editor.


### Inicio y Proyectos: responsabilidades separadas

Inicio es el resumen del workspace: plazos, proximos cierres y hallazgos. La
lista de seguimiento usa filas compactas, conserva filtros/busqueda y permite
abrir proyectos. No es un segundo Kanban. Su accion Abrir Kanban de proyectos
abre expresamente esa vista, incluso si se habia elegido Tabla antes.

Proyectos concentra el Kanban operativo y la tabla alternativa. La pestana fija
Proyectos, el boton +, Volver a proyectos y cerrar la ultima pestana llevan alli.
No hay selector desplegable ni seleccion automatica del primer proyecto. Las
vistas globales dejan libre el ancho; la sidebar aparece en el contexto del
proyecto. Las pestanas conservan los proyectos abiertos y su ultima seccion.

Los estados comparten etiquetas: Por iniciar, En curso, Asignado / En cierre,
Finalizado. Se conservan los IDs y la confirmacion de asignacion existentes;
no se introduce un estado nuevo de revision. Las tarjetas muestran el plazo.
La preferencia Kanban/Tabla y las acciones de crear, renombrar, borrar, buscar,
asignar y reordenar permanecen. Tareas/checklists por proyecto quedan para un
incremento propio; no se deduce avance real a partir de los hallazgos abiertos.

Validacion: lint/build y Chromium con IPC simulado para Inicio, Kanban/Tabla,
busqueda, cambio/cierre de pestanas, guardado al navegar y anchos 960/1280/1680.
Sin cambios Rust ni de formatos persistidos en esta reorganizacion.

### Feedback de arrastre en Proyectos

El Kanban existente muestra una tarjeta flotante que sigue al cursor, origen
atenuado, columna resaltada y marca de insercion antes de una tarjeta o al final.
La preview utiliza un portal sin interceptar eventos. Escape y perder foco
cancelan sin guardar; botones internos no inician arrastre. Se conservan el
orden persistido, cambio de estado y confirmacion de asignacion. Los listeners
usan la version actual de los datos para movimientos consecutivos.

Implementado en Projects.tsx y workbench.css sin dependencias ni esquemas nuevos.
Lint/build correctos (aviso de bundle existente). Chromium con IPC simulado:
preview y destino, Escape sin escrituras, dos cambios consecutivos persistidos,
confirmacion de asignacion y apertura por clic. Este ajuste frontend no repite
checks Rust; no equivale a validacion del gesto en todas las WebViews nativas.

### Tablas y conservacion de contenido

Los editores abren por defecto en Markdown sin interpretar. El boton Vista
permite pasar al editor visual cuando el contenido es compatible. Impacto
tiene una altura minima de 320 px y Prueba de concepto de 420 px en ambas
vistas; los textarea permiten ampliar manualmente su altura. Esta preferencia
afecta la presentacion del editor, no la estructura del PDF ni los archivos.

El PDF soporta tablas GFM. Mientras TipTap no incorpore nodos de tabla, el
contenido con separadores GFM se abre en modo Markdown, con una indicacion
visible y sin conversion a vista enriquecida que eliminaria celdas. Vista
previa sigue usando Typst. No cambia el formato persistido. Detalles en
[guia de render](docs/markdown-and-render.md).

### Edicion asistida de Markdown y estructura de Reporte

Todos los cuerpos de redaccion usan MarkdownEditor: hallazgos, secciones y texto
libre del reporte, documentos, plantillas de hallazgos y snippets. El codigo de
plantillas Typst y los textos posicionados en portada conservan sus controles
especificos. Titulos, fechas, CVSS y metadata siguen siendo campos simples.

La vista fuente ofrece formato sobre la seleccion sin convertir todo el documento
con TipTap. Ctrl/Cmd+B, I y K actuan solo dentro del textarea; fuera se conservan
los atajos globales. Las tablas mantienen sus celdas y la barra de formato.

Reporte separa Configuracion (datos) de Orden del documento (bloques numerados).
Las filas distinguen contenido editable, automatico y oculto; la seleccion es un
boton accesible. El agarre permite arrastrar y Subir/Bajar ofrece una alternativa.
El orden persistido no cambia hasta una accion del usuario; la seleccion sigue
al bloque movido. Se conservan la vista previa, exportacion y flujo fijo de OSCP.
