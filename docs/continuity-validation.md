# Continuidad: evidencia local R1–R5 y C1

Fecha: 26/10/2026. Productor PuduReport, funcionalidad `Unreleased` sobre 0.0.26.
Implementacion autorizada del [plan r3](../PLAN_PUDUREPORT_0.0.26_CONTINUIDAD.md).
No se consulto Git ni se acredita un tag, commit remoto o release.

Revalidacion posterior del 27/10/2026 tras las correcciones de Rust/Sonar:
[resultados y alcance](quality-validation.md).

## Resultado

| Control | Resultado ejecutado |
| --- | --- |
| R1 | **98 pruebas core aprobadas**, incluidas identidad, preparacion parcial, bloqueo entre procesos, copia, plantillas y fallo de reemplazo atomico. Ejecutadas como parte de la suite de workspace final. |
| R2 | **ESLint sin warnings, 29 pruebas Node aprobadas, Prettier correcto y build TypeScript/Vite aprobado**. Vite avisa del chunk mayor a 500 kB (964.64 kB, 311.46 kB gzip); no falla el build. |
| R3 | **rustfmt y Clippy `-D warnings` aprobados**. Suite Rust acotada: **141 pruebas aprobadas** = 98 core + 24 Tauri/exportador + 19 MCP. **3 pruebas excluidas**, de SQLite/Git, por las restricciones del encargo. No equivale a ejecutar la suite completa sin filtros. |
| R4 | **12 checkpoints UI aprobados**, con Chromium headless local, IPC/HTTP simulado y capturas revisadas en claro/oscuro. Ninguna excepcion JS ni respuesta HTTP de recursos >=400 en la ultima ejecucion. No es una prueba de webview Tauri nativa. |
| R5 | Revision de las consideraciones RU/TS completada en el alcance modificado; evidencias y limites abajo. |
| C1 | **Legacy aceptado por el validador offline actual de PuduHub; v2 rechazado**. No se probo HTTP, autenticacion, persistencia ni conciliacion del receptor. |

## Entorno y comandos ejecutados

Windows x64, Git Bash, Rust/Cargo 1.93.0, Node 24.22.0, pnpm 11.25.0,
TypeScript 5.9.3, Vite 6.4.3 y Typst 0.13.1. La preparacion/instalacion del
entorno fue autorizada antes de las verificaciones. No se modificaron manifests,
lock JavaScript o CI upstream para adaptarlos al entorno de PuduHub.

Las dependencias JS estan en el directorio temporal
`C:/Users/ignacio.e.alarcon/AppData/Local/Temp/opencode/pudureport-continuidad-deps`,
con `node_modules` enlazado al proyecto. Se utilizo hoisting en ese entorno para
resolver dependencias transitivas usadas por el frontend existente. pnpm requiere
`PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` para no intentar reemplazar esa junction.
No se presenta esta disposicion como nuevo setup upstream.

Comandos en Git Bash, desde
`C:/Users/ignacio.e.alarcon/Desktop/ciberseguridad/PuduReport`:

```bash
export PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
export TEMP='C:/Users/ignacio.e.alarcon/AppData/Local/Temp/opencode'
export TMP="$TEMP"
export PUDU_TYPST_BIN='C:/Users/ignacio.e.alarcon/Desktop/ciberseguridad/PuduReport/src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe'
CARGO='C:/Users/ignacio.e.alarcon/.cargo/bin/cargo.exe'

pnpm run lint
node --test scripts/*.test.mjs
pnpm exec prettier --check \
  src/lib/types.ts src/lib/api.ts src/lib/exportFlow.ts src/lib/pendingWrites.ts \
  src/components/ProjectContinuity.tsx src/screens/PdfPreview.tsx \
  src/views/ReportBuilder.tsx src/views/FindingEditor.tsx \
  src/views/ContentEditor.tsx src/views/TemplateLibrary.tsx src/App.tsx \
  scripts/export-flow.test.mjs scripts/pending-writes.test.mjs \
  scripts/continuity-ui-mock.mjs scripts/continuity-ui.html vite.config.ts
pnpm run build
"$CARGO" fmt --all --check
"$CARGO" clippy --locked --offline --workspace --all-targets -- -D warnings
"$CARGO" test --locked --offline --workspace -- --skip db::tests --skip git::tests
```

Los sidecars Typst y MCP de desarrollo se prepararon antes de compilar Tauri.
Las pruebas de request HTTP inspeccionan los bytes de `reqwest::Request` sin
ejecutarlo. La suite usa archivos temporales y Typst; no abre bases de datos ni
ejecuta pruebas de historial Git. `--offline` de Cargo evita resolucion/descarga
de crates por red; no se afirma un sandbox de red para toda la suite Rust.

Registros finales de build `sh_1792ff022001S0tKiDKqxTHLsH` y R4
`sh_179316b17001Y44y8TYM1Kd6kb`. El cambio de guardado/lectura bajo un mismo
bloqueo aprobo Clippy en `sh_1793805d70011VfnuJm3SVDqt6`.

La suite intermedia `sh_17938febb0012ICgkdMnYlnZKP` detecto una expectativa
incorrecta en la prueba ampliada: el resultado guardado incluye el salto final
del Markdown, mientras el borrador usado en la asercion no lo incluia. Se
corrigio esa expectativa conservando el comportamiento de persistencia. En el
cierre se repitieron en primer plano rustfmt, Clippy del workspace y la suite
Rust acotada: todos aprobados, con **24 + 98 + 19 = 141 pruebas**, sin fallos
y con las mismas tres exclusiones. Estos resultados sustituyen la ejecucion
intermedia; incluyen la correccion de concurrencia y su prueba.

## R4: interfaz con dobles

Harness reproducible manualmente: `scripts/continuity-ui.html` y
`scripts/continuity-ui-mock.mjs`, descritos en [la guia](continuity.md).
El runner local de verificacion uso Playwright Core 1.64.1 y Chromium ya
instalados, sin agregar dependencias del productor ni usar datos reales.
Se bloquearon requests a hosts distintos de `127.0.0.1`.

1. Elegir v2 en un proyecto anterior bloquea Enviar y no genera UUID.
2. El inventario muestra dos identidades pendientes y las opciones de copia.
3. Preparacion explicita; Tab/Shift+Tab quedan en el dialogo; Escape lo cierra
   y devuelve foco al boton de apertura.
4. Continuacion conserva UUID; copia independiente los renueva y confirma la
   referencia. Referencia vacia en continuacion no se hereda.
5. Editar referencia y navegar espera su guardado.
6. Duplicar espera el ultimo cambio de titulo y usa un UUID nuevo.
7. Preview v2 contiene las identidades y referencia del proyecto activo.
8. Doble activacion mientras el doble retiene la respuesta produce un solo
   envio; su string coincide con el del preview.
9. Respuesta 422 simulada conserva perfil y bloquea otro envio hasta nueva revision.
10. Dialogo de continuidad visible y utilizable en tema oscuro, ademas del claro.
11. Editar perfil/campos y guardar regenera el preview con la configuracion nueva.
12. Error de keychain simulado aparece tanto en preview como en configuracion;
    no se transforma en ausencia de token.

Capturas finales `1.png`–`12.png` y `results.json` quedaron en el directorio local
`C:/Users/ignacio.e.alarcon/AppData/Local/Temp/opencode/pudureport-r4`.
El runner temporal `pudureport-r4-check.mjs` esta en su directorio padre.
Las capturas del inventario, preview y configuracion se inspeccionaron; las
acciones largas del formulario usan su scroll. Los artefactos temporales no son
dependencias de las pruebas del repositorio.

Se resolvieron dos bloqueos del entorno: Chrome DevTools tenia el perfil ocupado
y el navegador embebido no permitia capturas. Chromium independiente permitio
completar R4. La primera captura uso fuentes de fallback porque Vite rechazaba
assets de la junction externa con 403; el runner final levanto un servidor
temporal en 1427 con acceso limitado al repo y ese directorio de dependencias.
La ultima ejecucion cargo las fuentes sin errores y cerro servidor/navegador.

Esta comprobacion no ejecuta el keychain real, el IPC nativo ni POST reales.
Los UUID del mock verifican cableado y estados de UI; las garantias de disco se
acreditan con core/MCP, no con el mock. La prueba nativa multiplataforma queda pendiente.

## C1: cotejo del receptor

Se copiaron explicitamente los cinco JSON a
`C:/Users/ignacio.e.alarcon/AppData/Local/Temp/opencode/pudureport-c1-20261026`.
Desde `../PuduHub/puduhub-backend` se ejecuto
`bash ../scripts/backend/uv.sh run --locked --no-sync python -`, con
`pytest_socket.disable_socket()`, `src.json_body.decode_json(raw)` y
`PuduReportImport.model_validate(...)`. No se modifico PuduHub.

| Fixture | Validacion offline |
| --- | --- |
| `legacy-0.0.25.json` | Aceptado, un hallazgo. |
| `legacy-0.0.26.json` | Aceptado, un hallazgo. |
| `optional-empty.json` | Aceptado, un hallazgo. |
| `partial.json` | Aceptado, un hallazgo. |
| `identified-v2.json` | Rechazado: `extra_forbidden` en `project.uid`, `project.external_reference`, `findings.0.uid` y `schema_version`. |

SHA-256 del archivo de esquema cotejado,
`src/vulnerabilidades/importacion/schemas.py`:
`b552645da245efccc71e7f4f0772bf5f00d2eaec1ab5ba33497a2bb3360912df`.

Huellas de los bytes JSON usados (no se reformatearon tras el cotejo):

| Fixture | SHA-256 |
| --- | --- |
| legacy-0.0.25 | `421380b6ffe235d248d287f3302e744fe772945f63050ec672deb6a37a47b03a` |
| legacy-0.0.26 | `79b01ca6c5b3a3009547df311c01ec7fa9daae8facb4290ea2b34c0945084d0b` |
| optional-empty | `fbe963982b1356b11975f7a4597a139e9d4ca8640f82ef46811a9a045aded4cc` |
| partial | `0081f37d581752915566d692b2f195f649e4f15641ecbfaa6d3c6dd24ccd9b6f` |
| identified-v2 | `a6e837db11e70151bc4e5f02970c8b166b74b3233ca4fdf9526036448437fe2d` |

La validacion del modelo no acredita respuesta HTTP 2xx ni almacenamiento de
recepciones. C1 v2 requiere implementar y aceptar el contrato del receptor,
incluida la autorizacion de emisores y la conciliacion, antes de activarlo en
uso real. El perfil legacy se mantiene predeterminado.

## R5: revision de buenas practicas

| Consideraciones | Evidencia y conclusion |
| --- | --- |
| RU-1/RU-2 | Identidad y copias centralizadas en core; enums `ExportProfile`/`CopyMode`; UUID validado con `uuid`. Tauri y MCP reutilizan las mismas operaciones. `PreparedExport::confirm(self, ...)` consume el snapshot. |
| RU-3 | Errores tipados Busy/ConcurrentChange/Identity/InvalidReference; propagacion a IPC/MCP. Fallos de red sin URL/token en el diagnostico de conexion. Las rutas nuevas de produccion no usan `unwrap`/`expect`. |
| RU-4 | Ausencia de UUID no genera uno; `null`/tipo incorrecto se rechazan. Perfil ausente es legacy, desconocido falla. `revision` se elimina al persistir; plantilla no transmite UUID. Tests de Serde y guardado. |
| RU-5 | `fs2` coordina app/MCP; RAII libera bloqueo y estado de envio. El guardado y la lectura de su resultado comparten el bloqueo: core devuelve el modelo persistido y su revision, consumidos directamente por Tauri/MCP, sin una segunda lectura fuera del bloqueo. Preparacion, copia, duplicacion y guardados Tauri/MCP usan executor bloqueante. Ningun Mutex de exportacion se sostiene durante `.await` o HTTP. Prueba con proceso hijo sincronizado por bloqueo, sin sleeps. |
| RU-6 | Temporales unicos en el mismo directorio, limpieza ante fallo, comprobacion de bytes y staging para copiar. Tests de fallo real de rename, preparacion interrumpida y cambio externo. No se promete transaccion multiarchivo, exclusion de editores no cooperativos o durabilidad universal. |
| RU-7 | Timestamp explicito en calculo puro, orden estable y snapshot. Fixtures verifican ocultos, seleccion y metadata; request construido conserva bytes. Recorte Unicode y referencia en caracteres; URL capturada forma parte de la vista. No se siguen redirects. |
| RU-8 | Tests autonomos, casos A/B/C en invariantes de creacion/copia/exportacion y fixtures sin secretos. `fs2=0.4.3` y `sha2=0.10` declarados en core con lock. Rust 1.93.0 comprobado; MSRV 1.77 no acreditado. |
| TS-1/TS-2 | `ExportState`/inventario discriminados, `unknown` para errores y respuestas preparadas; narrowing de inventario/preview en `api.ts`. Tipos de `destination_url`, perfiles, revision y UUID alineados con Rust. IPC centralizado. |
| TS-3/TS-4 | Identidad viene de Rust; guardados conservan revisiones. Actualizadores React de proyecto/hallazgo sin efectos secundarios. Fallos conservan borradores; error de keychain distinto de token ausente, tambien al editar destinos. |
| TS-5/TS-6 | Contexto workspace/proyecto/destino/perfil/campos; cleanup y generaciones descartan respuestas tardias. `flushWrites` antes de preparar, copiar y enviar. Pruebas de respuestas fuera de orden, cambio de contexto, doble activacion y fallo de guardado/HTTP/IPC. No se cancela ni reintenta un POST por ocultar una vista. |
| TS-7 | ESLint, Node y tsc ejecutados por separado. No se habilitaron flags globales ni otro runner en el productor. UI con dobles complementa, sin sustituir, tests Rust y revision de concurrencia. |

Limites adicionales: el guardado tipado habitual no promete conservar campos
desconocidos de futuras versiones (la preparacion/copia si conserva el mapeo);
versiones antiguas pueden perder UUID al guardar. La preparacion valida todos
los hallazgos, incluidos ocultos, para evitar conflictos latentes. Un request
preparado se valida antes de red, sin bloquear posteriores ediciones durante la
espera de respuesta. Los tokens permanecen fuera del payload y de los fixtures.

## Pendientes para contribucion/aceptacion

- Receptor v2, conciliacion y autorizacion operativa; C1 v2 no esta aprobado.
- Webview nativa y keychain en Windows/macOS/Linux; compatibilidad MSRV 1.77.
- Suite sin exclusiones cuando se autoricen las pruebas correspondientes,
  gate de licencias, auditoria de dependencias y CI remota.
- Requisitos de CLA/revision del upstream y publicacion mediante PR a `dev`.
  No se ejecutaron comandos Git, commits, push, despliegues ni exportaciones reales.
