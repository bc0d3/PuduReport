// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Export de resumen de hallazgos a CSV. Genera una tabla plana (sin el cuerpo
//! ni la PoC) con las columnas que elija el usuario, para compartir un panorama
//! rapido (ej. por correo). Excluye los hallazgos ocultos, igual que el PDF.

use std::path::Path;
use std::time::Duration;

use pudureport_core::models::{
    categoria_riesgo_label, CvssVersion, ExportTarget, Finding, FindingStatus, ProjectMeta,
    Severity,
};
use pudureport_core::workspace;
use serde_json::{json, Map, Value};

use crate::naming;

/// Etiqueta de la cabecera de cada columna soportada.
fn header_for(col: &str) -> &str {
    match col {
        "numero" => "#",
        "titulo" => "Titulo",
        "severidad" => "Severidad",
        "cvss" => "CVSS",
        "cvss_vector" => "Vector CVSS",
        "cvss_version" => "Version CVSS",
        "cwe" => "CWE",
        "estado" => "Estado",
        "afectados" => "Afectados",
        "nuevo" => "Nuevo",
        "modulo" => "Modulo",
        "impacto_negocio" => "Impacto al negocio",
        "categoria_riesgo" => "Categoria de riesgo",
        "causa_raiz" => "Causa raiz",
        other => other,
    }
}

/// Severidad en espaniol para el CSV.
fn severity_label(s: Severity) -> &'static str {
    match s {
        Severity::Critical => "Critica",
        Severity::High => "Alta",
        Severity::Medium => "Media",
        Severity::Low => "Baja",
        Severity::Info => "Informativa",
    }
}

/// Estado de remediacion en espaniol para el CSV.
fn status_label(s: FindingStatus) -> &'static str {
    match s {
        FindingStatus::Open => "Abierto",
        FindingStatus::Fixed => "Corregido",
        FindingStatus::Accepted => "Aceptado",
        FindingStatus::Wontfix => "No se corregira",
    }
}

/// Caracteres que, al inicio de una celda, hacen que Excel, LibreOffice o
/// Google Sheets la interpreten como formula.
const FORMULA_TRIGGERS: [char; 4] = ['=', '+', '-', '@'];

/// Neutraliza la inyeccion de formulas (CSV injection): si el primer caracter
/// no blanco es `=`, `+`, `-` o `@`, o si la celda empieza con tabulador o
/// retorno de carro, antepone una comilla simple para que la planilla la trate
/// como texto. Se aplica a todas las columnas por igual, sin excepciones por
/// tipo: un valor numerico negativo (que hoy ninguna columna produce; CVSS va
/// de 0 a 10 y el numero de hallazgo empieza en 1) se exportaria como texto
/// `'-1`, que es preferible a abrir una excepcion que un texto libre podria
/// aprovechar (ej. `-1+HYPERLINK(...)`).
fn neutralize_formula(field: &str) -> std::borrow::Cow<'_, str> {
    if field.starts_with(['\t', '\r']) || field.trim_start().starts_with(FORMULA_TRIGGERS) {
        std::borrow::Cow::Owned(format!("'{field}"))
    } else {
        std::borrow::Cow::Borrowed(field)
    }
}

/// Escapa un campo para CSV: primero neutraliza formulas (ver
/// `neutralize_formula`) y luego aplica RFC 4180: si trae coma, comilla o salto
/// de linea, se encierra entre comillas y se duplican las comillas internas.
fn csv_escape(field: &str) -> String {
    let field = neutralize_formula(field);
    if field.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.into_owned()
    }
}

/// Titulo de la causa raiz a la que apunta un hallazgo ("" si no tiene).
fn root_cause_title<'a>(f: &Finding, project: &'a ProjectMeta) -> &'a str {
    project
        .causas_raiz
        .iter()
        .find(|c| !f.meta.causa_raiz.is_empty() && c.clave == f.meta.causa_raiz)
        .map(|c| c.titulo.trim())
        .unwrap_or("")
}

/// Valor de una columna para un hallazgo dado (1-based `n`).
fn value_for(col: &str, n: usize, f: &Finding, project: &ProjectMeta) -> String {
    match col {
        "numero" => n.to_string(),
        "titulo" => f.meta.title.clone(),
        "severidad" => severity_label(f.meta.severity).to_string(),
        "cvss" => f.meta.cvss.clone(),
        "cvss_vector" => f.meta.cvss_vector.clone(),
        "cvss_version" => match f.meta.cvss_version {
            CvssVersion::V31 => "3.1",
            CvssVersion::V40 => "4.0",
        }
        .to_string(),
        "cwe" => f.meta.cwe.join(", "),
        "estado" => status_label(f.meta.status).to_string(),
        "afectados" => f.meta.affected.join("; "),
        "nuevo" => if f.meta.new_in_retest { "Si" } else { "" }.to_string(),
        "modulo" => f.meta.modulo.trim().to_string(),
        "impacto_negocio" => f.meta.impacto_negocio.trim().to_string(),
        "categoria_riesgo" => categoria_riesgo_label(&f.meta.categoria_riesgo).to_string(),
        "causa_raiz" => root_cause_title(f, project).to_string(),
        _ => String::new(),
    }
}

/// Escribe `build/{Cliente}-{Tipo}-{fecha}-resumen.csv` (ver `naming.rs`) con
/// las columnas pedidas (en ese orden) y devuelve la ruta. Excluye los
/// hallazgos ocultos.
pub fn export_csv(root: &Path, project_id: &str, columns: &[String]) -> Result<String, String> {
    if columns.is_empty() {
        return Err("elegi al menos una columna".to_string());
    }
    let project = workspace::read_project_meta(root, project_id).map_err(|e| e.to_string())?;
    let findings: Vec<_> = workspace::list_findings(root, project_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|f| !f.meta.hidden)
        .collect();

    let mut csv = String::from("\u{FEFF}"); // BOM: Excel abre UTF-8 con acentos.
    let header: Vec<String> = columns.iter().map(|c| csv_escape(header_for(c))).collect();
    csv.push_str(&header.join(","));
    csv.push_str("\r\n");

    for (i, f) in findings.iter().enumerate() {
        let row: Vec<String> = columns
            .iter()
            .map(|c| csv_escape(&value_for(c, i + 1, f, &project)))
            .collect();
        csv.push_str(&row.join(","));
        csv.push_str("\r\n");
    }

    let build_dir = root.join(project_id).join("build");
    std::fs::create_dir_all(&build_dir).map_err(|e| e.to_string())?;
    let path = build_dir.join(format!(
        "{}-resumen.csv",
        naming::standard_basename(&project)
    ));
    std::fs::write(&path, csv).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

// ---------------------------------------------------------------------------
// Exportacion a API externa (opt-in)
// ---------------------------------------------------------------------------

/// Slug estable (no traducido) de la severidad para consumo por maquina.
fn severity_slug(s: Severity) -> &'static str {
    match s {
        Severity::Critical => "critical",
        Severity::High => "high",
        Severity::Medium => "medium",
        Severity::Low => "low",
        Severity::Info => "info",
    }
}

/// Slug estable del estado de remediacion.
fn status_slug(s: FindingStatus) -> &'static str {
    match s {
        FindingStatus::Open => "open",
        FindingStatus::Fixed => "fixed",
        FindingStatus::Accepted => "accepted",
        FindingStatus::Wontfix => "wontfix",
    }
}

/// Valor JSON tipado de un campo para un hallazgo (1-based `n`). Mismo
/// vocabulario de campos que el CSV, pero con tipos utiles para KPIs (numeros,
/// arrays, slugs), no strings. Los campos desconocidos devuelven null. NUNCA
/// expone el cuerpo/PoC del hallazgo. Los campos de negocio (`modulo`,
/// `impacto_negocio`, `categoria_riesgo`, `causa_raiz`) solo salen si el
/// destino los configura: no estan en los campos por default.
fn json_value_for(col: &str, n: usize, f: &Finding, project: &ProjectMeta) -> Value {
    match col {
        "numero" => json!(n),
        "titulo" => json!(f.meta.title),
        "severidad" => json!(severity_slug(f.meta.severity)),
        "cvss" => match f.meta.cvss.trim().parse::<f64>() {
            Ok(v) => json!(v),
            Err(_) if f.meta.cvss.trim().is_empty() => Value::Null,
            Err(_) => json!(f.meta.cvss),
        },
        "cvss_vector" => json!(f.meta.cvss_vector),
        "cvss_version" => json!(match f.meta.cvss_version {
            CvssVersion::V31 => "3.1",
            CvssVersion::V40 => "4.0",
        }),
        "cwe" => json!(f.meta.cwe),
        "estado" => json!(status_slug(f.meta.status)),
        "afectados" => json!(f.meta.affected),
        "nuevo" => json!(f.meta.new_in_retest),
        "modulo" => json!(f.meta.modulo.trim()),
        "impacto_negocio" => json!(f.meta.impacto_negocio.trim()),
        // Slug de la lista cerrada, o null si no esta definida.
        "categoria_riesgo" => match f.meta.categoria_riesgo.as_str() {
            "" => Value::Null,
            slug => json!(slug),
        },
        // Clave estable + titulo legible, o null si no tiene causa raiz.
        "causa_raiz" if f.meta.causa_raiz.is_empty() => Value::Null,
        "causa_raiz" => json!({
            "clave": f.meta.causa_raiz,
            "titulo": root_cause_title(f, project),
        }),
        _ => Value::Null,
    }
}

/// Valor de un dato opcional del proyecto (`target.project_fields`) para el
/// bloque `project` del payload. Devuelve None si la clave es desconocida o si
/// el proyecto no lo tiene definido: en ese caso la clave se omite (nunca se
/// envia null ni "").
fn project_field_value<'a>(key: &str, project: &'a ProjectMeta) -> Option<&'a str> {
    let value = match key {
        "environment" => project.ambiente.as_str(),
        "exposure" => project.exposicion.as_str(),
        _ => return None,
    };
    (!value.is_empty()).then_some(value)
}

/// Arma el payload JSON de exportacion para un proyecto y un destino, con el
/// esquema estable definido por `target.fields`. Puro (no hace red): la UI lo
/// usa para mostrar la vista previa exacta de lo que se enviara. Excluye los
/// hallazgos ocultos, igual que el PDF y el CSV, y nunca incluye el cuerpo.
/// Los datos opcionales del proyecto (`target.project_fields`) solo se agregan
/// si el destino los activa y el proyecto los tiene definidos.
pub fn build_api_payload(
    root: &Path,
    project_id: &str,
    target: &ExportTarget,
) -> Result<Value, String> {
    let project = workspace::read_project_meta(root, project_id).map_err(|e| e.to_string())?;
    let findings: Vec<Finding> = workspace::list_findings(root, project_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|f| !f.meta.hidden)
        .collect();

    let items: Vec<Value> = findings
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let mut obj = Map::new();
            for field in &target.fields {
                obj.insert(field.clone(), json_value_for(field, i + 1, f, &project));
            }
            Value::Object(obj)
        })
        .collect();

    let mut payload = json!({
        "source": "pudureport",
        "exported_at": workspace::now_utc_iso(),
        "project": {
            "id": project_id,
            "name": project.name,
            "client": project.client,
            "type": project.project_type,
            "start_date": project.start_date,
            "end_date": project.end_date,
        },
        "findings": items,
    });

    for key in &target.project_fields {
        if let Some(value) = project_field_value(key, &project) {
            payload["project"][key.as_str()] = json!(value);
        }
    }

    if target.include_summary {
        let mut counts: std::collections::BTreeMap<&str, usize> = std::collections::BTreeMap::new();
        for f in &findings {
            *counts.entry(severity_slug(f.meta.severity)).or_insert(0) += 1;
        }
        payload["summary"] = json!({
            "total": findings.len(),
            "by_severity": counts,
        });
    }

    Ok(payload)
}

/// Resultado de un envio a la API, para devolver al frontend.
#[derive(serde::Serialize)]
pub struct ApiSendResult {
    /// Codigo HTTP de la respuesta.
    pub status: u16,
    /// true si el status esta en el rango 2xx.
    pub ok: bool,
    /// Cuerpo de la respuesta, acotado (para diagnostico en la UI).
    pub body: String,
}

/// Envia el payload a la API del destino via POST JSON con `Authorization:
/// Bearer <token>`. Exige https:// (rechaza http en claro). Timeout de 15s. El
/// token nunca se registra ni se incluye en el payload. Es la unica salida de
/// red de la app ademas del updater, y solo corre cuando el usuario lo pide.
/// Exige que el destino use https:// (no http en claro). Sincrono para poder
/// testearlo sin runtime async y para fallar antes de abrir cualquier conexion.
fn ensure_https(url: &str) -> Result<(), String> {
    if url
        .trim_start()
        .to_ascii_lowercase()
        .starts_with("https://")
    {
        Ok(())
    } else {
        Err("el destino debe usar https:// (no se permite http en claro)".to_string())
    }
}

pub async fn send_to_api(url: &str, token: &str, payload: &Value) -> Result<ApiSendResult, String> {
    ensure_https(url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("no se pudo crear el cliente HTTP: {e}"))?;

    let resp = client
        .post(url.trim())
        .bearer_auth(token)
        .json(payload)
        .send()
        .await
        .map_err(|e| format!("fallo la conexion con el destino: {e}"))?;

    let status = resp.status();
    let mut body = resp.text().await.unwrap_or_default();
    if body.len() > 2000 {
        body.truncate(2000);
        body.push_str("...");
    }
    Ok(ApiSendResult {
        status: status.as_u16(),
        ok: status.is_success(),
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pudureport_core::models::{Finding, FindingMeta};

    fn tmp_ws() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("pudu-export-{}", uuid::Uuid::new_v4()));
        workspace::create_workspace(&dir, "WS").unwrap();
        dir
    }

    fn finding(id: &str, title: &str, sev: Severity, cvss: &str, hidden: bool) -> Finding {
        Finding {
            id: id.to_string(),
            meta: FindingMeta {
                title: title.to_string(),
                severity: sev,
                cvss: cvss.to_string(),
                cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H".to_string(),
                cwe: vec!["CWE-89".to_string()],
                status: FindingStatus::Open,
                affected: vec!["https://app.demo.example/login".to_string()],
                hidden,
                ..Default::default()
            },
            body: "## Descripcion\n\nSECRETO NDA: 10.0.0.1 admin:hunter2".to_string(),
        }
    }

    #[test]
    fn ensure_https_only() {
        assert!(ensure_https("https://api.bughunter.cl/import").is_ok());
        assert!(ensure_https("  https://api.bughunter.cl").is_ok());
        assert!(ensure_https("http://api.bughunter.cl").is_err());
        assert!(ensure_https("ftp://x").is_err());
        assert!(ensure_https("api.bughunter.cl").is_err());
    }

    #[test]
    fn payload_is_metadata_only_stable_schema_and_excludes_body() {
        let root = tmp_ws();
        let (pid, _) = workspace::create_project(&root, "Web", "ACME", "pentest").unwrap();
        workspace::write_finding(
            &root,
            &pid,
            &finding("001-a", "SQLi", Severity::Critical, "9.8", false),
        )
        .unwrap();
        // Un hallazgo oculto NO debe salir en el payload.
        workspace::write_finding(
            &root,
            &pid,
            &finding("002-b", "Oculto", Severity::High, "8.1", true),
        )
        .unwrap();

        let target = ExportTarget {
            name: "bughunter".to_string(),
            url: "https://api.bughunter.cl/import".to_string(),
            fields: vec![
                "titulo".to_string(),
                "severidad".to_string(),
                "cvss".to_string(),
                "cwe".to_string(),
                "estado".to_string(),
                "afectados".to_string(),
            ],
            include_summary: true,
            project_fields: Vec::new(),
        };

        let payload = build_api_payload(&root, &pid, &target).unwrap();

        assert_eq!(payload["source"], "pudureport");
        let items = payload["findings"].as_array().unwrap();
        assert_eq!(items.len(), 1, "el hallazgo oculto no debe exportarse");

        let f = &items[0];
        // Esquema estable: exactamente los campos configurados, nada mas.
        let keys: Vec<&String> = f.as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), target.fields.len());
        for field in &target.fields {
            assert!(f.get(field).is_some(), "falta el campo {field}");
        }
        // Tipos utiles para KPIs, no strings.
        assert_eq!(f["severidad"], "critical");
        assert_eq!(f["cvss"], 9.8);
        assert!(f["cwe"].is_array());
        assert!(f["afectados"].is_array());

        // El cuerpo/PoC NUNCA sale por este canal.
        let serialized = payload.to_string();
        assert!(!serialized.contains("Descripcion"));
        assert!(!serialized.contains("SECRETO NDA"));
        assert!(!serialized.contains("hunter2"));

        // Summary con conteos por severidad.
        assert_eq!(payload["summary"]["total"], 1);
        assert_eq!(payload["summary"]["by_severity"]["critical"], 1);
    }

    /// Workspace con un proyecto que tiene una causa raiz y un hallazgo con
    /// todos los campos de negocio, mas otro hallazgo sin ellos.
    fn project_with_business_fields() -> (std::path::PathBuf, String) {
        let root = tmp_ws();
        let (pid, mut meta) = workspace::create_project(&root, "Web", "ACME", "pentest").unwrap();
        meta.causas_raiz = vec![pudureport_core::models::CausaRaiz {
            clave: "validacion".to_string(),
            titulo: "Validacion de entradas".to_string(),
            descripcion: String::new(),
        }];
        meta.finding_order = vec!["001-a".to_string(), "002-b".to_string()];
        workspace::write_project_meta(&root, &pid, &meta).unwrap();
        let mut f = finding("001-a", "SQLi", Severity::Critical, "9.8", false);
        f.meta.modulo = "Login".to_string();
        f.meta.impacto_negocio = "Fuga de la base de clientes, con datos personales.".to_string();
        f.meta.categoria_riesgo = "fuga_datos".to_string();
        f.meta.causa_raiz = "validacion".to_string();
        workspace::write_finding(&root, &pid, &f).unwrap();
        workspace::write_finding(
            &root,
            &pid,
            &finding("002-b", "Cabeceras", Severity::Low, "3.1", false),
        )
        .unwrap();
        (root, pid)
    }

    const BUSINESS_FIELDS: [&str; 4] = [
        "modulo",
        "impacto_negocio",
        "categoria_riesgo",
        "causa_raiz",
    ];

    #[test]
    fn payload_no_incluye_campos_de_negocio_si_el_destino_no_los_configura() {
        // Destino previo (campos por default): mismo esquema de siempre.
        let (root, pid) = project_with_business_fields();
        let target = ExportTarget {
            name: "hub".to_string(),
            url: "https://hub.example/api/import".to_string(),
            fields: vec![
                "titulo".to_string(),
                "severidad".to_string(),
                "cvss".to_string(),
                "cvss_vector".to_string(),
                "cwe".to_string(),
                "estado".to_string(),
                "afectados".to_string(),
            ],
            include_summary: true,
            project_fields: Vec::new(),
        };
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        for item in payload["findings"].as_array().unwrap() {
            assert_eq!(item.as_object().unwrap().len(), target.fields.len());
            for key in BUSINESS_FIELDS {
                assert!(item.get(key).is_none(), "{key} no deberia salir");
            }
        }
        assert!(!payload.to_string().contains("Fuga de la base"));
    }

    #[test]
    fn payload_incluye_campos_de_negocio_configurados_con_tipos_estables() {
        let (root, pid) = project_with_business_fields();
        let mut fields = vec!["numero".to_string()];
        fields.extend(BUSINESS_FIELDS.iter().map(|k| k.to_string()));
        let target = ExportTarget {
            name: "hub".to_string(),
            url: "https://hub.example/api/import".to_string(),
            fields,
            include_summary: false,
            project_fields: Vec::new(),
        };
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        let items = payload["findings"].as_array().unwrap();
        assert_eq!(items[0]["modulo"], "Login");
        assert_eq!(
            items[0]["impacto_negocio"],
            "Fuga de la base de clientes, con datos personales."
        );
        assert_eq!(items[0]["categoria_riesgo"], "fuga_datos");
        assert_eq!(items[0]["causa_raiz"]["clave"], "validacion");
        assert_eq!(items[0]["causa_raiz"]["titulo"], "Validacion de entradas");
        // Sin datos: la clave sigue presente (esquema estable por destino).
        assert_eq!(items[1]["modulo"], "");
        assert_eq!(items[1]["impacto_negocio"], "");
        assert!(items[1]["categoria_riesgo"].is_null());
        assert!(items[1]["causa_raiz"].is_null());
        for item in items {
            assert_eq!(item.as_object().unwrap().len(), target.fields.len());
        }
    }

    #[test]
    fn csv_agrega_columnas_de_negocio_solo_si_se_piden() {
        let (root, pid) = project_with_business_fields();
        let columns: Vec<String> = ["numero", "titulo"].iter().map(|c| c.to_string()).collect();
        let path = export_csv(&root, &pid, &columns).unwrap();
        let csv = std::fs::read_to_string(path).unwrap();
        assert!(csv.starts_with("\u{FEFF}#,Titulo\r\n"));
        assert!(!csv.contains("Login"));

        let mut columns = columns;
        columns.extend(BUSINESS_FIELDS.iter().map(|k| k.to_string()));
        let path = export_csv(&root, &pid, &columns).unwrap();
        let csv = std::fs::read_to_string(path).unwrap();
        let lines: Vec<&str> = csv.trim_start_matches('\u{FEFF}').lines().collect();
        assert_eq!(
            lines[0],
            "#,Titulo,Modulo,Impacto al negocio,Categoria de riesgo,Causa raiz"
        );
        assert_eq!(
            lines[1],
            "1,SQLi,Login,\"Fuga de la base de clientes, con datos personales.\",Fuga de datos personales,Validacion de entradas"
        );
        assert_eq!(lines[2], "2,Cabeceras,,,,");
    }

    #[test]
    fn csv_escape_neutraliza_formulas() {
        // Cada disparador de formula queda como texto con comilla simple.
        assert_eq!(csv_escape("=1+1"), "'=1+1");
        assert_eq!(csv_escape("+1"), "'+1");
        assert_eq!(csv_escape("-1"), "'-1");
        assert_eq!(csv_escape("@SUM(A1)"), "'@SUM(A1)");
        // Blancos delante no esconden el disparador.
        assert_eq!(csv_escape("  =1+1"), "'  =1+1");
        assert_eq!(csv_escape("\u{00A0}=1"), "'\u{00A0}=1");
        // Tabulador o retorno de carro al inicio tambien se neutralizan; el CR
        // ademas obliga a citar el campo (RFC 4180).
        assert_eq!(csv_escape("\tx"), "'\tx");
        assert_eq!(csv_escape("\r=1"), "\"'\r=1\"");
        // La neutralizacion va dentro de las comillas y las comillas internas
        // se duplican.
        assert_eq!(
            csv_escape("=HYPERLINK(\"https://x.example\",\"ver\")"),
            "\"'=HYPERLINK(\"\"https://x.example\"\",\"\"ver\"\")\""
        );
        assert_eq!(csv_escape("=1,2"), "\"'=1,2\"");
    }

    #[test]
    fn csv_escape_no_altera_valores_normales() {
        assert_eq!(csv_escape("9.8"), "9.8");
        assert_eq!(csv_escape("0.0"), "0.0");
        assert_eq!(csv_escape("1"), "1");
        assert_eq!(
            csv_escape("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
            "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
        );
        assert_eq!(csv_escape("CWE-89, CWE-79"), "\"CWE-89, CWE-79\"");
        assert_eq!(csv_escape("a@b.example"), "a@b.example");
        assert_eq!(csv_escape("1-2"), "1-2");
        assert_eq!(csv_escape(""), "");
        assert_eq!(csv_escape("dijo \"hola\""), "\"dijo \"\"hola\"\"\"");
    }

    #[test]
    fn csv_neutraliza_formulas_en_columnas_de_texto_libre() {
        let root = tmp_ws();
        let (pid, mut meta) = workspace::create_project(&root, "Web", "ACME", "pentest").unwrap();
        meta.causas_raiz = vec![pudureport_core::models::CausaRaiz {
            clave: "formula".to_string(),
            titulo: "@SUM(1+1)*cmd|' /C calc'!A0".to_string(),
            descripcion: String::new(),
        }];
        workspace::write_project_meta(&root, &pid, &meta).unwrap();
        let mut f = finding("001-a", "=1+1", Severity::Critical, "9.8", false);
        f.meta.modulo = "+Login".to_string();
        f.meta.impacto_negocio = "-2+3, fuga de datos".to_string();
        f.meta.causa_raiz = "formula".to_string();
        f.meta.affected = vec!["=HYPERLINK(\"https://x.example\")".to_string()];
        workspace::write_finding(&root, &pid, &f).unwrap();

        let columns: Vec<String> = [
            "numero",
            "titulo",
            "cvss",
            "afectados",
            "modulo",
            "impacto_negocio",
            "causa_raiz",
        ]
        .iter()
        .map(|c| c.to_string())
        .collect();
        let path = export_csv(&root, &pid, &columns).unwrap();
        let csv = std::fs::read_to_string(path).unwrap();
        let lines: Vec<&str> = csv.trim_start_matches('\u{FEFF}').lines().collect();
        assert_eq!(
            lines[1],
            "1,'=1+1,9.8,\"'=HYPERLINK(\"\"https://x.example\"\")\",'+Login,\"'-2+3, fuga de datos\",'@SUM(1+1)*cmd|' /C calc'!A0"
        );
    }

    /// Destino minimo con los datos opcionales del proyecto indicados.
    fn target_with_project_fields(project_fields: &[&str]) -> ExportTarget {
        ExportTarget {
            name: "puduhub".to_string(),
            url: "https://hub.example/api/import".to_string(),
            fields: vec!["titulo".to_string()],
            include_summary: false,
            project_fields: project_fields.iter().map(|k| k.to_string()).collect(),
        }
    }

    /// Workspace con un proyecto cuyo ambiente/exposicion son los indicados.
    fn project_with_classification(
        ambiente: &str,
        exposicion: &str,
    ) -> (std::path::PathBuf, String) {
        let root = tmp_ws();
        let (pid, mut meta) = workspace::create_project(&root, "Web", "ACME", "pentest").unwrap();
        meta.ambiente = ambiente.to_string();
        meta.exposicion = exposicion.to_string();
        workspace::write_project_meta(&root, &pid, &meta).unwrap();
        (root, pid)
    }

    /// Claves del bloque `project`, ordenadas.
    fn project_keys(payload: &Value) -> Vec<String> {
        let mut keys: Vec<String> = payload["project"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        keys.sort();
        keys
    }

    const ORIGINAL_PROJECT_KEYS: [&str; 6] =
        ["client", "end_date", "id", "name", "start_date", "type"];

    #[test]
    fn payload_project_sin_project_fields_no_cambia() {
        // Aunque el proyecto tenga ambiente/exposicion, un destino que no los
        // activa recibe exactamente el bloque `project` de siempre.
        let (root, pid) = project_with_classification("produccion", "internet");
        let payload = build_api_payload(&root, &pid, &target_with_project_fields(&[])).unwrap();
        assert_eq!(project_keys(&payload), ORIGINAL_PROJECT_KEYS);
    }

    #[test]
    fn payload_project_incluye_environment_y_exposure_si_se_activan() {
        let (root, pid) = project_with_classification("qa", "interno");
        let target = target_with_project_fields(&["environment", "exposure"]);
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        assert_eq!(payload["project"]["environment"], "qa");
        assert_eq!(payload["project"]["exposure"], "interno");
        assert_eq!(
            project_keys(&payload).len(),
            ORIGINAL_PROJECT_KEYS.len() + 2
        );
    }

    #[test]
    fn payload_project_omite_campos_activados_pero_vacios() {
        // Activados en el destino pero sin definir en el proyecto: se omite la
        // clave (nunca null ni "").
        let (root, pid) = project_with_classification("", "");
        let target = target_with_project_fields(&["environment", "exposure"]);
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        assert_eq!(project_keys(&payload), ORIGINAL_PROJECT_KEYS);

        // Solo uno definido: sale solo ese.
        let (root, pid) = project_with_classification("produccion", "");
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        assert_eq!(payload["project"]["environment"], "produccion");
        assert!(payload["project"].get("exposure").is_none());
    }

    #[test]
    fn payload_project_ignora_claves_desconocidas() {
        let (root, pid) = project_with_classification("qa", "internet");
        let target = target_with_project_fields(&["bogus", "gerencia", "ambiente"]);
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        assert_eq!(project_keys(&payload), ORIGINAL_PROJECT_KEYS);
    }

    #[test]
    fn payload_project_no_envia_valores_fuera_de_la_lista() {
        // Un project.yaml editado a mano con texto libre no sale por la API.
        let (root, pid) = project_with_classification("staging", "dmz");
        let target = target_with_project_fields(&["environment", "exposure"]);
        let payload = build_api_payload(&root, &pid, &target).unwrap();
        assert_eq!(project_keys(&payload), ORIGINAL_PROJECT_KEYS);
    }
}
