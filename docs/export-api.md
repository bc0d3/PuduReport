# Contrato de exportacion a API (PuduReport)

PuduReport puede enviar los hallazgos de un proyecto a una API externa que vos
configures (opt-in; ver "Destinos de exportacion" en CLAUDE.md). Este documento
describe exactamente que recibe tu endpoint, para que puedas definir tu DTO.

## Transporte

- Metodo: `POST`
- `Content-Type: application/json`
- `Authorization: Bearer <token>` (el token lo configura el usuario; PuduReport
  lo guarda en el keychain del sistema, nunca en el repo).
- Solo `https://` (PuduReport rechaza `http://` en claro).
- Un `POST` por proyecto, on-demand (cuando el usuario aprieta "Enviar").
- Se espera una respuesta HTTP 2xx para considerar el envio exitoso. El cuerpo
  de la respuesta se muestra al usuario (util para devolver un id o un error).

## Forma del payload

```
{
  "source": "pudureport",          // string constante, siempre presente
  "exported_at": "<ISO-8601 UTC>", // "YYYY-MM-DDTHH:MM:SSZ"
  "project": { ... },              // siempre presente (ver abajo); algunos campos son opcionales
  "summary": { ... },              // presente solo si el destino activa "summary"
  "findings": [ { ... }, ... ]     // array; cada item solo trae los campos configurados
}
```

Importante:

- **El orden de las claves no es significativo** (en el cable salen alfabeticas).
  Tu parser no debe depender del orden.
- **Los campos de cada hallazgo son configurables por destino.** El usuario elige
  una vez que campos manda, y a partir de ahi manda siempre ese mismo set
  (esquema estable). Diseña tu DTO tratando cada campo de hallazgo como opcional,
  y quedate con los que tu destino tenga configurados.
- **El cuerpo y la prueba de concepto de los hallazgos NUNCA se envian** por este
  canal (solo metadata). Tampoco los hallazgos ocultos.

### `project` (siempre presente)

| Campo        | Tipo   | Notas                                        |
|--------------|--------|----------------------------------------------|
| `id`         | string | slug del proyecto (ej. `proyecto-de-ejemplo`)|
| `name`       | string |                                              |
| `client`     | string |                                              |
| `type`       | string | `pentest` `redteam` `oscp` `htb` `ejecutivo` `documento` `retest` `cti` `incidente` `auditoria` `cumplimiento` `riesgos` `hunting` |
| `start_date` | string | `YYYY-MM-DD` (puede venir vacio)             |
| `end_date`   | string | `YYYY-MM-DD` (puede venir vacio)             |
| `environment`| string (enum), opcional | `qa` `produccion`. Solo si el destino lo activa y el proyecto lo tiene definido |
| `exposure`   | string (enum), opcional | `internet` `interno`. Solo si el destino lo activa y el proyecto lo tiene definido |

`environment` y `exposure` son **opt-in por destino** ("Datos del proyecto
(opcionales)" en la configuracion del destino) y vienen apagados por default,
asi un receptor que rechaza claves desconocidas sigue recibiendo el mismo
`project` de siempre. Si el destino los activa pero el proyecto no los tiene
definidos, la clave se omite: nunca llega `null` ni `""`. Sirven para clasificar
el reporte sin trabajo manual (ej. un SLA de remediacion segun la exposicion).

### `summary` (opcional, si el destino lo activa)

| Campo         | Tipo               | Notas                                         |
|---------------|--------------------|-----------------------------------------------|
| `total`       | number             | cantidad de hallazgos exportados (sin ocultos)|
| `by_severity` | objeto `{sev: n}`  | solo incluye las severidades presentes        |

Severidades posibles como clave de `by_severity`: `critical` `high` `medium`
`low` `info`.

### `findings[]` (campos configurables)

Cada objeto trae SOLO los campos que el destino tenga configurados. Estos son
todos los posibles y su tipo:

| Campo          | Tipo                        | Notas                                                        |
|----------------|-----------------------------|--------------------------------------------------------------|
| `numero`       | number                      | orden en el reporte, 1-based                                 |
| `titulo`       | string                      |                                                              |
| `severidad`    | string (enum)               | `critical` `high` `medium` `low` `info`                      |
| `cvss`         | number \| string \| null    | numero si es parseable; string si es cualitativo (examenes); null si esta vacio |
| `cvss_vector`  | string                      | puede venir vacio                                            |
| `cvss_version` | string                      | `3.1` o `4.0`                                                |
| `cwe`          | string[]                    | ej. `["CWE-89"]`; puede venir vacio                          |
| `estado`       | string (enum)               | `open` `fixed` `accepted` `wontfix`                          |
| `afectados`    | string[]                    | URLs/hosts; puede venir vacio                                |
| `nuevo`        | boolean                     | flag de "nuevo en retest"                                    |
| `modulo`       | string, opcional            | modulo o componente afectado (hasta 120 caracteres); puede venir vacio |
| `impacto_negocio` | string, opcional         | impacto para el negocio en un parrafo de texto plano (hasta 500 caracteres); puede venir vacio |
| `categoria_riesgo` | string (enum) \| null, opcional | `fuga_datos` `fraude_economico` `interrupcion_servicio` `incumplimiento_regulatorio` `reputacional` `reconocimiento`; `null` si no esta definida |
| `causa_raiz`   | objeto \| null, opcional     | `{ "clave": string, "titulo": string }` de la causa raiz del proyecto; `null` si el hallazgo no tiene |

Los cuatro ultimos (campos de negocio del informe de ethical hacking) **no
vienen activados por default** ni en destinos nuevos ni en los existentes: un
receptor que rechaza claves desconocidas sigue recibiendo el mismo payload hasta
que el usuario los marque en "Campos a enviar". Si el destino los activa, la
clave viene en todos los hallazgos (esquema estable): `""` para los textos
vacios y `null` para `categoria_riesgo` y `causa_raiz` sin definir. La `clave`
de `causa_raiz` es un slug estable dentro del proyecto (no cambia si se edita el
titulo); no es unica entre proyectos.

Etiquetas legibles de `categoria_riesgo` (las que usa el PDF y el CSV):

| Valor                        | Etiqueta                       |
|------------------------------|--------------------------------|
| `fuga_datos`                 | Fuga de datos personales       |
| `fraude_economico`           | Fraude economico               |
| `interrupcion_servicio`      | Interrupcion del servicio      |
| `incumplimiento_regulatorio` | Incumplimiento regulatorio     |
| `reputacional`               | Reputacional                   |
| `reconocimiento`             | Reconocimiento y persistencia  |

Nota sobre `cvss`: en tipos de examen (`oscp`, `htb`) la severidad es cualitativa
y no hay CVSS numerico; en esos casos `cvss` puede llegar como string o `null`.
Para KPIs numericos conviene basarse en `severidad` (siempre presente si esta
configurada) y usar `cvss` solo cuando sea `number`.

## Ejemplo real (campos base activados)

Con `environment` y `exposure` activados en el destino y definidos en el
proyecto. Si no se activan, esas dos claves no aparecen.

```json
{
  "source": "pudureport",
  "exported_at": "2026-09-12T00:15:34Z",
  "project": {
    "id": "proyecto-de-ejemplo",
    "name": "Proyecto de ejemplo",
    "client": "Cliente Demo S.A.",
    "type": "pentest",
    "start_date": "2026-01-13",
    "end_date": "2026-01-24",
    "environment": "produccion",
    "exposure": "internet"
  },
  "summary": { "total": 3, "by_severity": { "critical": 1, "high": 1, "low": 1 } },
  "findings": [
    {
      "numero": 1,
      "titulo": "Inyeccion SQL en el formulario de autenticacion",
      "severidad": "critical",
      "cvss": 9.8,
      "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      "cvss_version": "3.1",
      "cwe": ["CWE-89"],
      "estado": "open",
      "afectados": ["https://app.demo.example/login"],
      "nuevo": false
    },
    {
      "numero": 2,
      "titulo": "Referencia directa insegura a objetos (IDOR) en la API",
      "severidad": "high",
      "cvss": 8.7,
      "cvss_vector": "CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N",
      "cvss_version": "4.0",
      "cwe": ["CWE-639"],
      "estado": "open",
      "afectados": ["https://api.demo.example/v1/users/{id}"],
      "nuevo": false
    }
  ]
}
```

Con los campos de negocio activados, cada hallazgo agrega (ejemplo del primer
hallazgo del proyecto de ejemplo):

```json
{
  "modulo": "Inicio de sesion",
  "impacto_negocio": "Un tercero sin credenciales puede ingresar como cualquier usuario y extraer la base de clientes, con exposicion de datos personales y obligacion de notificar la brecha.",
  "categoria_riesgo": "fuga_datos",
  "causa_raiz": { "clave": "validacion-entradas", "titulo": "Validacion de entradas insuficiente en el servidor" }
}
```

## DTO de referencia (TypeScript)

Para tu API receptora. Los campos de `Finding` van como opcionales porque el
usuario configura cuales manda (pero para un destino dado, el set es estable).

```ts
type Severity = "critical" | "high" | "medium" | "low" | "info";
type Status = "open" | "fixed" | "accepted" | "wontfix";
type Environment = "qa" | "produccion";
type Exposure = "internet" | "interno";
type RiskCategory =
  | "fuga_datos"
  | "fraude_economico"
  | "interrupcion_servicio"
  | "incumplimiento_regulatorio"
  | "reputacional"
  | "reconocimiento";

interface PuduReportExport {
  source: "pudureport";
  exported_at: string; // ISO-8601 UTC
  project: {
    id: string;
    name: string;
    client: string;
    type: string;
    start_date: string;
    end_date: string;
    // Solo si el destino los activa y el proyecto los tiene definidos.
    environment?: Environment;
    exposure?: Exposure;
  };
  summary?: {
    total: number;
    by_severity: Partial<Record<Severity, number>>;
  };
  findings: PuduReportFinding[];
}

interface PuduReportFinding {
  numero?: number;
  titulo?: string;
  severidad?: Severity;
  cvss?: number | string | null;
  cvss_vector?: string;
  cvss_version?: "3.1" | "4.0";
  cwe?: string[];
  estado?: Status;
  afectados?: string[];
  nuevo?: boolean;
  // Campos de negocio: solo si el destino los activa (apagados por default).
  modulo?: string;
  impacto_negocio?: string;
  categoria_riesgo?: RiskCategory | null;
  causa_raiz?: { clave: string; titulo: string } | null;
}
```

## Ejemplo de handler (pseudocodigo)

```
POST /api/import/data/pudureport/
  auth: verificar Bearer token
  body: PuduReportExport (validar source === "pudureport")
  guardar project + findings; usar summary para KPIs
  responder 200 { "id": "<id de la importacion>" }
```

## Prompt de implementacion (para tu API receptora)

Pega esto en tu asistente de IA para generar el endpoint que recolecta la data.
Es self-contained: trae el contrato adentro. Reemplaza lo que esta entre < >.

---

Implementa un endpoint de ingesta para recibir exportaciones de PuduReport (una
herramienta de reportes de pentest) y guardar la data para KPIs.

Stack: <tu stack, ej. Node + Express + PostgreSQL / FastAPI + SQLModel / Go + chi>.

Endpoint: `POST /api/import/data/pudureport/`
- Autenticacion: header `Authorization: Bearer <token>`. Valida el token contra
  una lista/config de tokens validos; si falta o es invalido, responde 401.
- `Content-Type: application/json`. Limita el tamano del body (ej. 5 MB).
- Valida que `source === "pudureport"`; si no, responde 400.
- Responde 200 con `{ "id": "<id de la importacion>" }` en exito.

Cuerpo (JSON) que vas a recibir. El orden de claves NO es significativo. Los
campos de cada hallazgo son OPCIONALES (el usuario configura cuales manda, pero
para un origen dado el set es estable): tratalos como opcionales en tu modelo.

```ts
type Severity = "critical" | "high" | "medium" | "low" | "info";
type Status = "open" | "fixed" | "accepted" | "wontfix";

interface PuduReportExport {
  source: "pudureport";
  exported_at: string; // ISO-8601 UTC "YYYY-MM-DDTHH:MM:SSZ"
  project: {
    id: string; name: string; client: string; type: string;
    start_date: string; end_date: string; // "YYYY-MM-DD" o ""
    // Opcionales: solo si el origen los activa y el proyecto los tiene definidos.
    environment?: "qa" | "produccion";
    exposure?: "internet" | "interno";
  };
  summary?: { total: number; by_severity: Partial<Record<Severity, number>> };
  findings: Array<{
    numero?: number; titulo?: string; severidad?: Severity;
    cvss?: number | string | null; // numero salvo examenes (oscp/htb)
    cvss_vector?: string; cvss_version?: "3.1" | "4.0";
    cwe?: string[]; estado?: Status; afectados?: string[]; nuevo?: boolean;
    // Opcionales (apagados por default): contexto de negocio del hallazgo.
    modulo?: string; impacto_negocio?: string; // "" si no esta definido
    categoria_riesgo?: "fuga_datos" | "fraude_economico" | "interrupcion_servicio"
      | "incumplimiento_regulatorio" | "reputacional" | "reconocimiento" | null;
    causa_raiz?: { clave: string; titulo: string } | null;
  }>;
}
```

Persistencia:
- Modela `import` (o `report_snapshot`), `project` y `finding` en tu DB.
- Idempotencia: una nueva exportacion del MISMO `project.id` es una nueva foto en
  el tiempo. Guarda cada import con su `exported_at`; no mezcles con imports
  previos del mismo proyecto (asi podes ver la evolucion). Indexa por
  `project.id` y `exported_at`.
- El cuerpo/PoC de los hallazgos NUNCA llega por este canal (solo metadata), y
  los hallazgos ocultos ya vienen excluidos: no asumas que `findings` es la lista
  completa del proyecto, es lo que el usuario decidio compartir.

KPIs a exponer (endpoints de lectura):
- Conteo de hallazgos por severidad (global, por cliente, por proyecto). Usa
  `severidad` (siempre confiable) y `cvss` solo cuando sea `number`.
- Evolucion en el tiempo por `exported_at` (ej. criticos abiertos por mes).
- Estado de remediacion: distribucion de `estado` (open/fixed/accepted/wontfix).
- Top CWE mas frecuentes.

Robustez:
- No confies en que todos los campos vengan; usa defaults seguros.
- `project.environment` y `project.exposure` pueden faltar: tratalos como "sin
  especificar" (no como un valor por defecto) y acepta solo los valores listados.
- `cvss` puede ser number, string o null: normaliza a number-o-null para agregaciones.
- `categoria_riesgo` y `causa_raiz` pueden faltar o venir en `null`: tratalos como
  "sin especificar". Acepta solo las categorias listadas.
- Registra los imports para auditoria (quien, cuando, cuantos hallazgos).

Entrega el codigo del endpoint, el modelo de datos (migraciones) y un par de
consultas KPI de ejemplo.

---
