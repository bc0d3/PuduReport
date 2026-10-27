# Identidad y continuidad de proyectos

Funcionalidad en desarrollo sobre 0.0.26, registrada en `Unreleased`.
El [contrato de exportacion](export-api.md) distingue el perfil predeterminado
`legacy` del perfil opt-in `identified_v2`. Actualiza y valida el receptor antes
de usar v2: agregar UUID al productor no implementa conciliacion en el receptor.

## Preparar un proyecto anterior

1. Abre el proyecto y ve a **Vista previa > Continuidad y copias**.
2. Revisa el inventario: UUID del documento, cantidad de hallazgos e identidades
   pendientes. Incluye hallazgos ocultos.
3. Pulsa **Preparar identidades**. La app guarda primero los cambios pendientes
   y completa solo los UUID ausentes en `project.yaml` y `findings/*.md`.
4. Si una escritura falla, conserva la carpeta y vuelve a abrir el inventario.
   Puedes repetir la preparacion: los UUID ya escritos no se regeneran.

Abrir, inspeccionar o previsualizar no asigna identidades. Un UUID invalido o
repetido bloquea la preparacion y v2; se identifica el archivo que hay que
revisar. No se repara mediante una regeneracion automatica. Si un archivo cambia
durante la operacion, se detiene para evitar reemplazar una revision distinta.

La preparacion conserva campos YAML desconocidos y el cuerpo Markdown. Puede
cambiar el formato y los comentarios del YAML. No es una transaccion de varios
archivos: un fallo puede dejar una preparacion parcial recuperable.

## Elegir el sentido de una copia

En **Continuidad y copias**, introduce el nombre y elige:

| Accion | Documento y hallazgos | Uso |
| --- | --- | --- |
| Continuar este trabajo | Conserva UUID; exige identidad completa | Otra persona o carpeta continua el mismo documento. |
| Crear un trabajo independiente | Genera UUID nuevos | Otro pentest, alcance o documento independiente. |

La copia se crea en una carpeta nueva del mismo workspace. El origen conserva
su contenido. Los nombres locales de hallazgos, su orden, enlaces relativos,
causas raiz y referencias del plan de remediacion se mantienen. Se copian assets
y archivos ocultos; se excluyen `build`, `.pudu` y `.git` en la raiz del proyecto.
Los enlaces simbolicos se rechazan. El staging se publica al completar la copia;
un fallo de proceso puede dejar una carpeta oculta en `.pudu`.

La **referencia compartida** se confirma por separado: vacia significa que la
copia no tiene referencia, incluso si el origen tenia una. Tambien se edita en
**Reporte > Datos del proyecto**. Se recortan espacios en los extremos y se
admiten entre 1 y 128 caracteres Unicode; borrar el campo lo omite. No es un
secreto, una credencial ni una instruccion de fusion. Solo sale en v2 cuando el
destino marca `external_reference` en sus campos de proyecto.

Duplicar un hallazgo e instanciar una plantilla siempre crean un UUID nuevo.
Guardar una plantilla reutilizable elimina su identidad de instancia. Cambiar
titulo, orden, estado o visibilidad conserva la identidad del hallazgo existente.

## Ejemplos de continuidad

- **A: agregar V3 al documento con V1/V2.** Se mantienen el UUID del documento y
  los de V1/V2. V3 tiene uno nuevo; su numero puede cambiar al reordenar. Un
  receptor con continuidad puede mantener tres hallazgos y dos recepciones.
- **B: documento nuevo `Portal_v2` con V3.** Es otro documento, con nuevas
  identidades. Comparte una referencia solo si corresponde al mismo trabajo;
  el receptor debe autorizar y resolver esa relacion.
- **C: otra persona crea `Portal`.** La coincidencia de nombre no une documentos
  ni hallazgos. Para continuar las identidades existentes, usa una copia de
  continuacion. Dos hallazgos creados independientemente requieren conciliacion
  aunque describan la misma vulnerabilidad.

`project.id` sigue siendo un slug local; `numero` es presentacion. Ninguno es una
identidad global. Un UUID identifica, pero no autoriza a un emisor ni demuestra
equivalencia entre vulnerabilidades. Las ausencias en un envio no son bajas y
`nuevo` sigue significando nuevo en retest.

## Revisar y enviar

1. En **Vista previa > Enviar a API**, selecciona el destino. Los destinos sin
   perfil declarado y los nuevos usan `legacy`.
2. Para un receptor compatible, edita **Perfil del receptor** a **Identificado
   v2**. Sus UUID y `schema_version: 2` son estructurales; los demas campos siguen
   siendo seleccionables.
3. Revisa perfil, URL y JSON. La app espera los autoguardados y Rust conserva los
   bytes preparados, incluido `exported_at`. La URL presentada pertenece a esa
   preparacion, aunque haya cambiado la configuracion en disco.
4. **Enviar** consume la preparacion una sola vez. Rust comprueba nuevamente
   workspace, proyecto, archivos y destino. Si cambiaron, hay que revisar otro
   preview. El cuerpo HTTP es el mismo string UTF-8 presentado, sin reconstruirlo.

No se envian cuerpos, PoC, evidencias, PDF, catalogos completos de causas raiz ni
planes de remediacion. Tampoco se envian revisiones locales o identificadores de
preparacion. Se mantienen HTTPS, Bearer en keychain y el envio iniciado por la
persona. No hay reintentos automaticos ni cambio silencioso a legacy ante un
rechazo. Un error HTTP o de conexion requiere **Revisar nueva vista previa**.
Si la respuesta se perdio, no se puede inferir si el receptor recibio el POST:
una nueva confirmacion es otro envio, no una operacion idempotente.

Cerrar la vista descarta sus respuestas tardias; no revierte un POST iniciado.
El bloqueo de envio en Rust tambien evita solicitudes simultaneas al cambiar de
vista. La comprobacion de archivos ocurre antes de la red: no se mantiene un
bloqueo del workspace mientras el receptor responde.

## Guardado concurrente y compatibilidad

App y MCP coordinan las escrituras de proyecto/hallazgo mediante un bloqueo de
sistema operativo en `.pudu/write.lock`. Es no bloqueante: si esta ocupado, la
operacion devuelve un error recuperable. No borres ese archivo mientras haya
procesos abiertos. El SO libera el bloqueo al cerrar el descriptor.

La revision SHA-256 representa los bytes leidos de cada archivo. Guardado y
lectura del resultado comparten el bloqueo para devolver esa revision antes de
que intervenga otro escritor cooperativo. Se transporta
por IPC/MCP, pero no se persiste. Un guardado existente necesita su revision y
UUID originales; rechaza reemplazos de identidad, cambios concurrentes y
guardados antiguos de archivos eliminados. La UI serializa autoguardados incluso
de archivos distintos, conserva el ultimo borrador al fallar y bloquea la
navegacion/exportacion mientras ese guardado no se resuelva.

Ante conflicto, conserva el texto del borrador, compara la version en disco y
recarga antes de aplicar la edicion acordada. No hay fusion automatica ni un
guardado forzado. Un editor externo que no respete el bloqueo puede escribir
entre la comprobacion y el reemplazo; no se promete exclusion frente a todos
los editores ni durabilidad ante cualquier corte de energia.

Las versiones anteriores pueden leer archivos ampliados pero eliminar `uid` al
guardarlos. Todas las personas que compartan continuidad deben usar una version
que preserve esas identidades. Si se perdieron, restaura la version conocida o
concilia expresamente con el receptor antes de preparar otras: generar UUID
nuevos no recupera por si solo las relaciones anteriores.

## Desarrollo y comprobacion

- `core/src/continuity.rs`: inventario, preparacion, copia y snapshot.
- `core/src/storage.rs`: bloqueo cooperativo y revisiones; `workspace.rs` aplica
  las invariantes a creaciones, guardados, duplicaciones y plantillas.
- `src-tauri/src/export.rs`: calculo puro con timestamp explicito,
  `PreparedExport` de un solo uso y construccion del request.
- `src/lib/exportFlow.ts`: estados discriminados y descarte de respuestas
  obsoletas; `pendingWrites.ts`: vaciado y serializacion de autoguardados.
- `tests/fixtures/export/`: contratos autonomos; las pruebas del productor no
  importan codigo ni fixtures desde otro checkout.

Para comprobar la interfaz con datos sinteticos, desde la raiz, en Git Bash:

```bash
pnpm run dev --host 127.0.0.1 --port 1426 --strictPort
```

Abre `http://127.0.0.1:1426/scripts/continuity-ui.html`. El harness instala mocks
de Tauri antes de cargar la app y reinicia sus datos al recargar. `window.__puduTest`
expone llamadas, proyectos y envios en memoria; `httpError`, `holdSend` y
`releaseSend` permiten simular rechazo y respuesta tardia. No guarda archivos ni
credenciales, no compila PDF y no hace POST. No forma parte del bundle de la app.
Sirve para comprobar la UI, no para acreditar IPC nativo, disco, keychain o un
receptor real. Las invariantes Rust se verifican por separado.

Ver [evidencia local y limites](continuity-validation.md) para R1–R5 y C1.
