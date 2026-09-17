# Markdown y render local

Los `.md` y `project.yaml` son la fuente de verdad. `build/data.json`, PDF y PNG
son artefactos derivados, no un cache que deba editarse a mano.

## Formato soportado en PDF

El conversor `core/src/markdown.rs` utiliza pulldown-cmark offline:

- Encabezados, parrafos, negrita y cursiva.
- Codigo inline y bloques de codigo, listas numeradas y sin numerar, citas.
- Enlaces, separadores, saltos explicitos de linea.
- Imagenes locales `![](assets/archivo.png)`, ancho opcional `![60%](...)`.
- Tablas GFM con encabezado y separador; alineacion izquierda/centro/derecha,
  celdas vacias, codigo, negrita y enlaces dentro de las celdas. Se convierten
  a tablas nativas Typst con encabezado repetido y paginacion entre filas.

```markdown
| IP | Host | Servicio |
|:---|:---:|---:|
| 192.0.2.1 | **router** | `https` |
| 192.0.2.2 | gateway | ssh |
```

Conserva los saltos entre filas. Una tabla previamente aplanada a una sola
linea ya no tiene estructura GFM; el conversor no puede reconstruirla.

HTML embebido se omite; no se soportan tablas HTML, celdas combinadas,
notas al pie, matematicas ni extensiones GFM de tareas/tachado. No se promete
fidelidad de un navegador HTML. Para inventarios muy anchos, dividir columnas
o usar listas por host. Evitar una unica celda con contenido de muchas paginas.

El editor visual TipTap actual no tiene nodos de tabla: los documentos con
separadores de tabla se abren en modo Markdown para conservar las celdas.
Para introducir tablas en la app, cambiar primero a Markdown y pegar alli.
No pegar tablas directamente en la vista enriquecida. Ver el resultado en
Vista previa. La edicion visual de celdas queda pendiente.

## MCP: editar y luego compilar

`create_finding`, `update_finding` y `update_section` escriben los originales.
No recompilan automaticamente. Despues de un grupo de cambios:

```json
{"name":"build_project","arguments":{"project_id":"mi-proyecto"}}
```

El servidor relee el disco, regenera `build/data.json`, prepara la plantilla
actual y compila el PDF con el mismo pipeline que la app. Devuelve `status`,
`pdf_paths` y una nota; un fallo de compilacion devuelve un error. Que exista un
PDF anterior no significa que el ultimo build haya funcionado.

No se devuelven PDF/base64 ni paginas PNG por MCP: pueden contener evidencias.
El PDF queda local para abrirlo en la app o un visor. Esto no valida visualmente
el layout desde el cliente MCP y no agrega una herramienta para leer assets.
Las plantillas base estan embebidas; los overrides del workspace tienen prioridad.
Typst se busca en `PUDU_TYPST_BIN`, junto al ejecutable o en PATH.

Tras actualizar el codigo, ejecutar `npm run mcp:sidecar` y reiniciar/reconectar
el cliente MCP para que lance el nuevo proceso y refresque `tools/list`.

## Crear hallazgos

Obligatorios: `project_id`, `title`. `body` es opcional: si falta se usa scaffold.
En proyectos normales, enviar `cvss_vector` para derivar puntaje y severidad;
`cvss_version` permite `3.1` (por defecto) o `4.0`. Se admite un borrador sin
vector. No enviar solo `severity`: es exclusivo de OSCP/HTB.

```json
{
  "project_id": "mi-proyecto",
  "title": "Control de acceso insuficiente",
  "body": "## Descripcion\n\nDetalle del hallazgo.",
  "cvss_version": "3.1",
  "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N"
}
```

Los slugs nuevos tienen hasta 64 caracteres mas el prefijo numerico incremental.
El titulo completo permanece en metadata. Los IDs existentes no se renombran.

## Validacion de este cambio

- `npm run lint` y `npm run build`: correctos; persiste aviso de bundle grande.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: correcto.
- `cargo clippy --workspace --all-targets -- -D warnings`: correcto.
- `PUDU_TYPST_BIN=... cargo test --workspace`: 91 tests correctos (9 app,
  67 core, 15 MCP), incluidas compilaciones reales de Typst. Los tests del
  pipeline PDF y nombres se trasladaron al core junto con la implementacion.
- Sidecar release recompilado. Prueba stdio real con workspace temporal:
  schema, creacion, slug, build, actualizacion y recompilacion correctos.
  Tabla de 100 filas paginada; reporte de siete paginas y captura revisada.
- Chromium con IPC simulado: abrir tabla, editar fuente, guardar y reabrir
  conserva filas/celdas. No se uso ni modifico el reporte del usuario.
