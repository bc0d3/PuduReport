# Correcciones Rust y Sonar: validacion local

Fecha: 27/10/2026. PuduReport 0.0.26 con los cambios locales de continuidad.
Complementa la [evidencia de continuidad](continuity-validation.md).

## Resultado

| Control | Resultado |
| --- | --- |
| Rust E0308 | Causa reproducida: rust-analyzer 0.3.3097 requiere Rust >=1.94, mientras el workspace usa 1.93. El analizador de la toolchain 1.93 devuelve diagnosticos vacios en ambos archivos afectados. |
| Cargo | `check` del paquete Tauri con todos sus targets, rustfmt y Clippy del workspace con `-D warnings`: aprobados. |
| Pruebas Rust | 141 aprobadas: 24 Tauri/exportador, 98 core y 19 MCP. Se excluyen las mismas 3 pruebas SQLite/Git del encargo anterior. |
| SonarJS | 12 archivos, 17 reglas, complejidad maxima 15: **0 hallazgos**, sin errores de parsing. |
| Frontend | ESLint sin warnings, TypeScript y build Vite aprobados; Prettier correcto en los archivos modificados. |
| Pruebas Node | **33 aprobadas**, incluidas 4 nuevas de drenaje, reordenamiento e identidad de filas. |
| Interfaz | **24 checkpoints aprobados**: 12 de continuidad y 12 de calidad de interfaz, con IPC/HTTP simulados y revision de capturas. |

Vite mantiene su aviso de chunk >500 kB: bundle JS final de 970.36 kB
(312.92 kB gzip). El build finalizo correctamente.

## Rust: correccion del entorno del analizador

El codigo de `src-tauri/src/export.rs:89` y `src-tauri/src/lib.rs:903`
compila con Rust 1.93.0. El servidor incluido en la extension VS Code
`rust-lang.rust-analyzer-0.3.3097-win32-x64` reprodujo los dos E0308 y
notifico por LSP:

```text
Workspace ... is using an outdated toolchain version `1.93.0`
but rust-analyzer only supports `1.94.0` and higher.
```

Se instalo el componente `rust-analyzer` de la toolchain existente mediante
`rustup component add rust-analyzer --toolchain 1.93.0-x86_64-pc-windows-msvc`.
La configuracion local `.vscode/settings.json` selecciona el proxy rustup:

```json
{
  "rust-analyzer.server.path": "${userHome}/.cargo/bin/rust-analyzer.exe"
}
```

`.vscode/` ya esta excluido por `.gitignore`. La configuracion corresponde a
esta instalacion Windows; no fija una nueva version Rust en el proyecto.
Para aplicarla en una ventana de VS Code ya abierta, ejecutar
**rust-analyzer: Restart server** o recargar la ventana.

La comprobacion LSP independiente inicializo `rust-analyzer 1.93.0
(254b5960 2026-01-19)`, espero la carga del workspace y solicito
`textDocument/diagnostic` para los dos documentos abiertos. Ambos devolvieron
`items: []`. No se agregaron conversiones, supresiones ni cambios Rust para
ocultar esos errores. El primer intento con un limite de tres minutos no
alcanzo a terminar `lib.rs`; la ejecucion posterior con limite ampliado
completo ambos documentos.

## SonarJS

Se uso el motor incluido en SonarQube for IDE 6.2.0, con informacion de tipos
del `tsconfig.json` del proyecto y TypeScript 6.0.3 interno del analizador.
El build del productor conserva TypeScript 5.9.3. ESLint se ejecuto por separado.

Reglas verificadas: `S3776` (umbral 15), `S1082`, `S3358`, `S6479`, `S6544`,
`S6582`, `S6759`, `S6767`, `S6772`, `S6819`, `S6847`, `S6848`, `S6853`,
`S7718`, `S7776`, `S9382` y `S9383`.

Archivos: `src/App.tsx`; `src/components/{ProjectContinuity,MarkdownEditor}.tsx`;
`src/views/{ContentEditor,FindingEditor,ReportBuilder,TemplateLibrary}.tsx`;
`src/screens/PdfPreview.tsx`; y
`src/lib/{pendingWrites,exportFlow,reportLayout,editorRows}.ts`.

El adaptador temporal carga el bundle instalado y llama al manejador
`analyze-project`, sustituyendo en memoria solamente su arranque de servidor
por la exposicion de esa funcion. No modifica la extension ni las reglas.
El primer pase detecto cinco hallazgos; el ultimo analizo los 12 archivos
con las 17 reglas y cero hallazgos. Esta es una comprobacion local del motor,
no una ejecucion de un Quality Gate remoto ni un analisis de todas las reglas.

SHA-256 de `eslint-bridge/package/bin/server.cjs`:
`2cf40006fa7369cee554d1ed8e51e094b1fe7355b47ac409047b0c3879728795`.

## Regresiones cubiertas

- Los `flush` concurrentes comparten el drenaje y su error. Una escritura
  fallida conserva la edicion mas nueva y el siguiente intento la persiste.
- Las escrituras siguen serializadas globalmente, incluso entre archivos.
  El drenaje incorpora cambios programados durante una escritura.
- La seleccion sigue al mismo bloque en todos los movimientos posibles de
  un documento de cinco bloques.
- Editar, eliminar o reordenar acciones conserva claves de interfaz estables.
  Filas de contenido identico siguen siendo distintas y el JSON no recibe IDs.
- Los contratos de exportacion, UUID, respuestas tardias, doble envio y
  correspondencia entre preview y request mantienen sus pruebas previas.

## Interfaz: 24 checkpoints

Se ejecutaron los dos runners con Chromium headless, Playwright Core 1.64.1 y
viewport de 1440 x 1080. Ambos finalizaron correctamente con 12 checkpoints
cada uno y `errors: []` en sus resultados finales.

### Continuidad: `pudureport-r4`

| Captura | Comprobacion aprobada |
| --- | --- |
| `1.png` | v2 bloquea proyectos legacy sin modificar sus identidades. |
| `2.png` | Inventario legacy y formulario de copia. |
| `3.png` | Preparacion explicita; Tab, Shift+Tab, Escape y retorno de foco. |
| `4.png` | Continuacion conserva UUID; copia independiente los renueva y confirma la referencia. |
| `5.png` | La referencia editada se guarda antes de navegar. |
| `6.png` | Duplicar espera el guardado y asigna un UUID nuevo. |
| `7.png` | Preview v2 incluye identidades y referencia. |
| `8.png` | Doble activacion produce un solo envio simulado, con los mismos bytes del preview. |
| `9.png` | Rechazo HTTP simulado conserva el perfil y exige nueva revision. |
| `10.png` | Continuidad en el tema alternativo. |
| `11.png` | Editar perfil y campos regenera el preview con la configuracion guardada. |
| `12.png` | Error de keychain simulado visible en preview y configuracion. |

### Calidad de interfaz: `pudureport-quality-ui`

| Captura | Comprobacion aprobada |
| --- | --- |
| `1.png` | Etiquetas de datos del proyecto asociadas a sus controles. |
| `2.png` | Eliminar una accion conserva DOM, clave, etiqueta y borrador de la siguiente. |
| `3.png` | Reordenar por teclado mantiene el bloque seleccionado, su editor y su borrador. |
| `4.png` | Arrastrar conserva la seleccion y permite seleccionar otro bloque despues. |
| `5.png` | Markdown fuente y visual tienen nombre accesible; un fallo de guardado conserva vista y borrador. |
| `6.png` | CSV respeta las columnas elegidas tras extraer el dialogo. |
| `7.png` | Portapapeles informa exito al resolver y notifica el rechazo. |
| `8.png` | Guardar snippet espera el callback, actualiza la lista y conserva el borrador ante un fallo. |
| `9.png` | Guardar plantilla de hallazgo refresca la lista tras una respuesta `void`. |
| `10.png` | Editor Typst bloquea Guardar tras un fallo de lectura y completa metadata y fuente antes de cerrar. |
| `11.png` | Secciones de estructura fija OSCP se seleccionan y ocultan con teclado. |
| `12.png` | Controles y editores Markdown de hallazgos tienen nombres accesibles en los modos comprobados. |

Se revisaron visualmente las capturas de configuracion en oscuro, datos de
proyecto, remediacion, reordenamiento, snippets, estructura OSCP y hallazgos.
En las vistas revisadas se mantienen la distribucion, las etiquetas y los
controles sin solapamientos visibles; la captura OSCP muestra el foco en el
control de visibilidad.

Los runners usan Vite local en los puertos 1427/1428, datos sinteticos y
dobles de IPC/HTTP; las peticiones del navegador se restringen a `127.0.0.1`.
Esta evidencia cubre la interfaz con esos dobles. La webview nativa de Tauri,
el keychain del sistema y los POST reales requieren validacion de integracion;
estos checkpoints tampoco constituyen una auditoria completa de accesibilidad.

## Comandos y artefactos

Desde `C:/Users/ignacio.e.alarcon/Desktop/ciberseguridad/PuduReport`, en Git Bash,
con las dependencias y sidecars del entorno descrito en la evidencia anterior:

```bash
export PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
export TEMP='C:/Users/ignacio.e.alarcon/AppData/Local/Temp/opencode'
export TMP="$TEMP"
export PUDU_TYPST_BIN="$PWD/src-tauri/binaries/typst-x86_64-pc-windows-msvc.exe"
CARGO="$HOME/.cargo/bin/cargo.exe"

pnpm run lint
node --test scripts/*.test.mjs
pnpm run build
"$CARGO" check --locked --offline -p pudureport --all-targets
"$CARGO" fmt --all --check
"$CARGO" clippy --locked --offline --workspace --all-targets -- -D warnings
"$CARGO" test --locked --offline --workspace -- --skip db::tests --skip git::tests
```

Los runners temporales `pudureport-sonar-check.cjs`, `pudureport-rust-lsp.cjs`,
`pudureport-r4-check.mjs` y `pudureport-quality-ui.mjs` residen en `$TEMP` y
dependen de las rutas de herramientas instaladas en esta maquina. Los resultados
del analizador estan en `pudureport-sonar-results.json` y
`pudureport-rust-lsp-compatible.json`. Las pruebas del repositorio no dependen
de esos archivos temporales.

La evidencia final de interfaz esta en `$TEMP/pudureport-r4/results.json` y
`$TEMP/pudureport-quality-ui/results.json`. Cada directorio contiene las
capturas `1.png` a `12.png`, correspondientes a las tablas anteriores.
