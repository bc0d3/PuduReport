# PuduReport — Guia de desarrollo

Doc para contribuir y entender la tool por dentro. El [README.md](README.md) es la cara publica; este es el de desarrollo.

## Resumen

App de escritorio **local-first y offline** para redactar reportes de pentest y generar PDF. Sin servidor ni Docker; la exportacion a API es opt-in y requiere confirmacion.

- **Framework**: Tauri v2 (core Rust + webview).
- **Frontend**: React + TypeScript + Vite.
- **Editor**: TipTap (markdown WYSIWYG; el usuario nunca teclea sintaxis).
- **PDF**: motor Typst (binario empaquetado como sidecar).
- **Indice**: SQLite (solo para busqueda; NUNCA fuente de verdad).

## Regla de oro

**Los archivos en disco son la fuente de verdad.** Toda escritura va a `.md`/`.yaml`; SQLite se reindexa desde los archivos, nunca al reves. Datos (`data.json`, generado) y presentacion (`.typ`, editable) van siempre separados.

## Como funciona (flujo de la tool)

1. El usuario elige una carpeta = **workspace** (`workspace.yaml` + carpetas de proyecto).
2. Dentro, cada **proyecto** tiene `project.yaml` (datos, secciones del reporte, orden de hallazgos), `findings/*.md` (front-matter YAML + cuerpo markdown), `assets/` (evidencias) y `build/` (generado, gitignored).
3. El **editor de hallazgos** llena campos estructurados (severidad/CVSS/estado/CWE) y secciones markdown (Descripcion/Impacto/PoC/Remediacion). La severidad se **deriva** del vector CVSS.
4. Al generar PDF: el backend serializa el proyecto a `build/data.json`, copia la plantilla `.typ` activa a `build/report.typ` + los assets, y compila con Typst.

### Pipeline de PDF en detalle

```
project.yaml + findings/*.md  ->  build_data()  ->  build/data.json
markdown (cuerpos)            ->  markdown::to_typst()  ->  markup Typst dentro del JSON
templates/<activa>.typ        ->  copia a build/report.typ (hace json("data.json"))
assets/                       ->  copia a build/assets/  (para #image)
typst compile --root <ws>     ->  build/<proyecto>.pdf   (o PNG por pagina para la preview)
```

El markdown a Typst se convierte en Rust (`markdown.rs`, con pulldown-cmark) para garantizar operacion 100% offline. Las imagenes pegadas quedan como `![](assets/<uuid>.<ext>)` y se renderizan con `#image(...)`; el ancho opcional viaja en el alt (`![60%](...)`).

## Estructura del repo

```
src/                      frontend React + TS
  components/             Rail, Sidebar, MarkdownEditor, CvssCalculator, Severity, Toast, Modal
  screens/                Onboarding, Projects, CoverEditor, PdfPreview, Settings
  views/                  FindingEditor, ReportBuilder, TemplateLibrary
  lib/                    api.ts (IPC tipado), types.ts, sections.ts, cvssMetrics.ts, severity.ts
src-tauri/
  src/
    lib.rs                comandos IPC + estado de la app
    export.rs             payload legacy/v2, preparacion y envio HTTP
    db.rs                 indice SQLite (reindexable)
    git.rs                init/commit sobre el workspace del usuario
  binaries/               sidecars typst-* y pudureport-mcp-* (gitignored, se generan por release)
  tauri.conf.json         config Tauri (CSP, assetProtocol, bundle, sidecar)
mcp/                      crate pudureport-mcp: servidor MCP por stdio (lee/edita hallazgos)
core/src/                 logica compartida por app y MCP
  workspace.rs            YAML/front-matter, assets, creacion y guardado
  models.rs               modelos persistentes e IPC
  continuity.rs           inventario, preparacion, copias y snapshot
  storage.rs              bloqueo entre procesos y revision optimista
  cvss.rs, pdf.rs, markdown.rs  puntuacion y pipeline de render
tests/fixtures/export/    contratos JSON autonomos y fuentes sinteticas
templates/                plantillas .typ base (pentest, oscp, htb, ejecutivo, documento-libre, retest)
scripts/fetch-typst.mjs   baja el sidecar de Typst por plataforma
scripts/build-mcp-sidecar.mjs  compila el sidecar pudureport-mcp por plataforma
.github/workflows/        ci.yml (fmt/clippy/lint/tests/build) y release.yml (tags v*)
```

## Setup de desarrollo

Requisitos: **Node 20+**, **Rust estable**, dependencias de Tauri para tu SO.

```bash
npm install
node scripts/fetch-typst.mjs        # coloca el sidecar de Typst para tu plataforma
node scripts/build-mcp-sidecar.mjs  # compila el sidecar del servidor MCP (requerido por externalBin)
npm run tauri dev                   # levanta Vite + compila Rust + abre la ventana nativa
```

Para desarrollo basta con tener `typst` en el PATH: el backend lo resuelve por `PUDU_TYPST_BIN`, sidecar junto al ejecutable, o PATH.

### Comandos utiles

```bash
# Frontend
npm run lint           # ESLint (max-warnings 0)
npm run build          # tsc (strict) + vite build
npm run format         # Prettier

# Backend (desde src-tauri/)
cargo test             # pruebas Rust; alcance local acotado en docs/continuity-validation.md
cargo clippy --all-targets -- -D warnings
cargo fmt --check

# Build del instalador
npm run tauri build    # genera .dmg / .msi / .exe / .AppImage / .deb
```

## Convenciones

- **Rust**: modulos chicos y enfocados; `thiserror` por modulo, comandos devuelven `Result<T, String>`; prohibido `unwrap()`/`expect()` en produccion; `clippy -D warnings` y `rustfmt` obligatorios; doc comments en funciones publicas.
- **TS/React**: modo strict, prohibido `any`; todo el IPC encapsulado en `lib/api.ts` (nunca `invoke` suelto); componentes funcionales + hooks; Context solo para lo compartido.
- **Diseno**: tokens en [DESIGN.md](DESIGN.md) (shell de escritorio, graphite oscuro y claro, Inter + JetBrains Mono, iconos Tabler). Sin emojis en codigo/UI/docs.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`...). Alimentan el CHANGELOG.
- **Ramas**: `feature/*`, `fix/*`, `docs/*` y `ci/*` abren PR contra `dev`.
  Solo `dev` abre PR de release contra `main`. Los releases se taguean `v*`
  desde `main`.

## Como agregar cosas

- **Una plantilla PDF nueva**: agrega `templates/mi-plantilla.typ`. Debe leer `json("data.json")` y consumir el mismo esquema; asi nunca rompe hallazgos existentes. Aparece sola en el selector.
- **Una seccion nueva del hallazgo**: edita `FINDING_SECTIONS` en `src/lib/sections.ts` (el cuerpo se sigue guardando como markdown con encabezados `##`).
- **Un comando IPC nuevo**: implementa la logica en el modulo Rust correspondiente, exponelo con `#[tauri::command]` en `lib.rs`, registralo en `invoke_handler!`, y agrega el wrapper tipado en `src/lib/api.ts`.

## Tests

- Rust: pruebas de core, exportador/Tauri y MCP, con archivos temporales y Typst para el pipeline PDF.
- TS: `node --test scripts/*.test.mjs` prueba utilidades, guardados y carreras del flujo de exportacion. Se complementa con `tsc` en el build: `transpileModule` no comprueba tipos.
- Continuidad: [arquitectura, operacion y harness de UI](docs/continuity.md), [contrato](docs/export-api.md) y [evidencia local R1–R5/C1](docs/continuity-validation.md).

Los guardados de core e IPC de proyecto y hallazgo devuelven la metadata recargada
bajo el mismo bloqueo de escritura con su
`revision`; conservarla para la siguiente escritura. El UUID se genera solo al
crear, preparar explicitamente o copiar como trabajo independiente. Las
operaciones nuevas de disco se ejecutan con `spawn_blocking`; los bloqueos en
memoria no se conservan durante `.await` ni durante HTTP. `fs2` coordina procesos
y `sha2` calcula revisiones. No introducir generacion de identidad en Serde o
`Default`, ni reconstruir el JSON al enviar una preparacion.

## Release

Tag `v*` en `main` -> `.github/workflows/release.yml` compila la matriz (macOS ARM+Intel, Windows, Linux), baja el sidecar de Typst y publica un release en borrador con los instaladores. Los instaladores van sin firmar (ver README).

## Seguridad

Reportes de vulnerabilidad: ver [SECURITY.md](SECURITY.md). No abrir issues publicos para temas de seguridad.

Markdown soportado, tablas y regeneracion por MCP: [guia de render](docs/markdown-and-render.md).

Guia integrada para clientes de IA: [autoria via MCP](docs/mcp-authoring.md),
tambien disponible offline mediante `get_authoring_guide`. La PoC puede editarse
sin reemplazar el resto del hallazgo usando `update_finding_section`.
