# Autoevaluacion de seguridad del servidor MCP (`pudureport-mcp`)

Este documento es una **autoevaluacion** (no una certificacion) de la seguridad
del servidor MCP de PuduReport. No se persigue ISO 27001 (certifica un SGSI de
organizacion, no un binario). En su lugar se disena a los controles de
frameworks reconocidos y se documenta el mapeo. Set de referencia:

- OWASP ASVS v4.0.3 (Application Security Verification Standard), niveles L1-L2.
- OWASP Top 10 for LLM Applications (2025).
- NIST AI RMF (funcion Govern), para el consentimiento.
- El threat model propio de MCP.

Diseno completo en `CLAUDE.md`, seccion "Servidor MCP".

## Que es y que no es

`pudureport-mcp` es un binario aparte (miembro del workspace de Rust) que expone
el workspace del usuario por **stdio** (JSON-RPC) para que la IA del usuario lea
y mejore el TEXTO de los reportes. **No embebe ningun LLM** ni hace llamadas de
red propias. El cliente MCP (ej. Claude Desktop) lanza el proceso y le habla por
pipes.

Superficie actual (herramientas en `mcp/src/main.rs`):

- Lectura: `list_projects`, `get_project`, `list_findings`, `get_finding`,
  `search_findings`, `get_workspace_info`.
- Escritura (solo texto de hallazgos): `create_finding`, `update_finding`.
- Calculo: `calc_cvss`.

No expone herramientas de plantillas, de configuracion, de borrado ni de
assets/evidencias.

## Modelo de amenaza (resumen)

- **Transporte stdio, sin puerto de red.** El cliente lanza el proceso y se
  comunica por pipes. No hay socket de escucha: ninguna otra maquina ni otro
  usuario puede conectarse. Verificado: el arbol de dependencias del crate no
  incluye stack HTTP (hyper/axum/tower-http/reqwest).
- **Scope a un unico workspace.** La ruta llega por argumento o
  `PUDUREPORT_WORKSPACE` y se valida que sea una carpeta
  (`resolve_workspace_root` + `is_dir` en `mcp/src/main.rs`). El servidor no ve
  nada fuera de esa ruta.
- **Activos.** El TEXTO de hallazgos y proyectos (puede traer IPs, hostnames,
  credenciales en un PoC). NUNCA los bytes de assets/evidencias.
- **Contenido no confiable.** El texto del reporte que la IA lee puede contener
  inyeccion indirecta de prompt (lo escribio un humano, o salio de un scanner).

## Autoevaluacion ASVS (L1-L2)

Por capitulo de ASVS v4.0.3. Estado: Cumple / N/A / Parcial. La evidencia
referencia el codigo.

| Capitulo ASVS | Aplicabilidad | Estado | Evidencia / Justificacion |
| --- | --- | --- | --- |
| V1 Arquitectura, diseno y threat modeling | Si | Cumple | Threat model documentado aca y en `CLAUDE.md`. Componente aislado, una responsabilidad. |
| V2 Autenticacion | N/A | N/A | Transporte stdio local, un solo usuario. No hay credenciales ni login. |
| V3 Gestion de sesiones | N/A | N/A | No hay sesiones: el cliente lanza el proceso y lo termina. |
| V4 Control de acceso | Si | Cumple | Acceso restringido por construccion del transporte (solo el usuario local que lanza el cliente). Scope a un workspace; sin acceso al resto del disco. |
| V5 Validacion, sanitizacion y encoding | Si | Cumple | `validate_id` (anti path-traversal) en toda funcion con id: rechaza `/`, `\`, `..`, nombres con mas de un componente y los que empiezan con `.` (`core/src/workspace.rs`). Los argumentos de cada herramienta se validan contra su JSON Schema (rmcp `Parameters<T>` + `schemars`). La severidad se deriva del vector CVSS, no se acepta a mano fuera de tipos de examen (`apply_severity` en `mcp/src/main.rs`). |
| V6 Criptografia | N/A | N/A | El servidor no almacena ni transmite secretos; no hay canal de red que cifrar (stdio local). |
| V7 Manejo de errores y logging | Parcial | Parcial | Los errores se devuelven tipados al cliente (`McpError::invalid_params` / `internal_error`) sin volcar rutas internas sensibles mas alla del workspace. No hay logging a disco (menos datos en reposo); contrapartida: no hay trazabilidad de auditoria. Aceptable para un binario local de un solo usuario. |
| V8 Proteccion de datos | Si | Cumple | Minimizacion: solo se expone texto y metadata; nunca bytes de assets/evidencias (no existe herramienta que los lea). El consentimiento explicito advierte que el texto puede salir del equipo segun el cliente. |
| V9 Comunicaciones | N/A | N/A | Sin comunicaciones de red propias. |
| V10 Codigo malicioso | Si | Cumple | Dependencias acotadas y pineadas via `Cargo.lock`; toolchain fijo (1.93.0). `cargo audit` (RUSTSEC) corre en CI (job `audit` en `.github/workflows/ci.yml`): falla ante una vulnerabilidad; los warnings unmaintained/unsound de la cadena GTK/Tauri se reportan sin bloquear. |
| V11 Logica de negocio | Si | Cumple | Escrituras acotadas y reversibles (git-diffables); sin operaciones destructivas expuestas. |
| V12 Archivos y recursos | Si | Cumple | Toda ruta de archivo pasa por `validate_id`; las escrituras van al `.md` del hallazgo dentro del workspace. Sin subida ni lectura de binarios. |
| V13 API y servicios web | Parcial | Cumple a nivel local | La "API" es JSON-RPC por stdio. Entrada validada por schema; sin endpoints de red. Conceptos de rate-limiting/CORS no aplican (sin red). |
| V14 Configuracion | Si | Cumple | El binario recibe solo la ruta del workspace. La instalacion en el cliente (escritura de `claude_desktop_config.json`) conserva las demas entradas y no pisa un config con JSON invalido (`src-tauri/src/mcp.rs`, con tests). |

## Checklist OWASP Top 10 for LLM Applications (2025)

PuduReport es un **servidor MCP, no un LLM**. Varios riesgos viven del lado del
cliente (donde corre el modelo); aca se documenta la postura del servidor.

| ID | Riesgo | Postura del servidor | Residual |
| --- | --- | --- | --- |
| LLM01 | Prompt Injection (incl. indirecta) | El texto del reporte que la IA lee NO es confiable y puede traer inyeccion indirecta. No se resuelve del lado servidor (el modelo corre en el cliente). Mitigacion: minima agencia (sin operaciones destructivas) + revision humana del git diff. | Si. Riesgo asumido; se gestiona con revision humana. |
| LLM02 | Divulgacion de informacion sensible | Solo se expone texto, nunca bytes de assets. El texto puede traer datos sensibles: el consentimiento lo advierte y recomienda modelo local (Ollama) para NDA. Modo "scrub" (placeholders) pendiente. | Parcial. El texto puede salir del equipo si el cliente usa nube (decision informada del usuario). |
| LLM03 | Supply chain | Dependencias pineadas (`Cargo.lock`), toolchain fijo (1.93.0), SDK oficial `rmcp`, `cargo audit` (RUSTSEC) en CI. | Bajo. |
| LLM04 | Data / model poisoning | N/A. El servidor no entrena ni ajusta modelos. | N/A. |
| LLM05 | Manejo inadecuado de la salida | El servidor no ejecuta la salida del modelo: las escrituras del modelo pasan por validacion de schema, `validate_id` y derivacion de severidad antes de tocar el `.md`. | Bajo. |
| LLM06 | Agencia excesiva | Herramientas de minima agencia: sin borrar, sin escribir config/plantillas, sin assets; writes acotados al texto de hallazgos y reversibles (git). | Bajo. |
| LLM07 | Fuga del system prompt | N/A. El servidor no tiene system prompt; no embebe LLM. | N/A. |
| LLM08 | Debilidades de vectores/embeddings | N/A. Sin RAG ni embeddings. | N/A. |
| LLM09 | Desinformacion | La IA puede redactar contenido incorrecto en un hallazgo. Mitigacion: revision humana antes de exportar el PDF. | Si. Se gestiona con revision humana. |
| LLM10 | Consumo no acotado | El cliente controla la frecuencia de llamadas; el servidor es local y de un solo usuario. Las herramientas son operaciones acotadas sobre archivos. | Bajo. |

## Consentimiento (NIST AI RMF - Govern)

Conectar el MCP desde la GUI ("Instalar en Claude Desktop", `src/screens/Settings.tsx`)
muestra una alerta explicita antes de escribir el config: advierte que el TEXTO
de los hallazgos queda accesible para el cliente de IA y que, si el cliente usa
un modelo en la nube, ese texto SALE del equipo; recomienda modelo local para
NDA y aclara que las evidencias nunca se exponen. La accion es reversible
("Desconectar" quita la entrada del config).

## Pendientes (definicion de "listo" de la fase)

- [x] Transporte stdio sin puerto de red (verificado: sin stack HTTP en deps).
- [x] Scope a un unico workspace.
- [x] Anti-traversal (`validate_id`) en toda ruta con id.
- [x] Solo texto, nunca bytes de assets/evidencias.
- [x] Severidad derivada del CVSS salvo tipos de examen.
- [x] Validacion de schema en la entrada de cada herramienta.
- [x] Minima agencia (sin borrados, sin config/plantillas).
- [x] Consentimiento explicito al conectar, reversible.
- [x] Esta autoevaluacion ASVS (L1-L2) + checklist LLM Top 10.
- [x] `cargo audit` (RUSTSEC) en CI (supply chain).
- [ ] Modo "scrub" (placeholders para IPs/nombres antes de exponer).
- [ ] Logging/auditoria opcional de las escrituras del MCP.

## Limitaciones honestas

- "El texto no es confidencial" es casi cierto, no del todo: un hallazgo puede
  traer IPs, hostnames, nombres o credenciales en el PoC. Para NDA estricto, usar
  un modelo local via un cliente MCP que lo soporte.
- La inyeccion indirecta de prompt (LLM01) no se resuelve 100% del lado servidor
  porque el modelo corre en el cliente. Se mitiga con minima agencia y revision
  humana de los cambios (git diff).
