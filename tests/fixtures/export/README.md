# Contratos sinteticos de exportacion

Estos archivos son autonomos y contienen solo datos de ejemplo:

| Archivo | Caso |
| --- | --- |
| `legacy-0.0.25.json` | Seleccion de campos del contrato anterior, sin metadata 0.0.26. |
| `legacy-0.0.26.json` | Metadata de negocio y clasificacion de proyecto seleccionadas. |
| `optional-empty.json` | Textos vacios, clasificaciones omitidas y categorias/causa raiz `null`. |
| `partial.json` | Seleccion parcial sin resumen. |
| `identified-v2.json` | Version 2, UUID y referencia compartida seleccionada. |

`project.yaml` y `findings/` son las fuentes para las pruebas de
`src-tauri/src/export/continuity_tests.rs`. Se fija `exported_at` para que la
comparacion sea reproducible. El hallazgo oculto no sale ni se cuenta. Los
marcadores de cuerpo y PoC permiten detectar una filtracion al payload.

El nombre `legacy-0.0.25` describe la forma compatible; no es una captura de un
binario antiguo ni acredita su ejecucion. Los JSON se comparan como valores; la
igualdad byte a byte se comprueba aparte entre preview, confirmacion y request.
Un receptor puede copiar estos JSON y validarlos sin depender de este checkout.
