// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Export de resumen de hallazgos a CSV. Genera una tabla plana (sin el cuerpo
//! ni la PoC) con las columnas que elija el usuario, para compartir un panorama
//! rapido (ej. por correo). Excluye los hallazgos ocultos, igual que el PDF.

use std::path::Path;
use std::time::Duration;

use pudureport_core::models::{CvssVersion, ExportTarget, Finding, FindingStatus, Severity};
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

/// Escapa un campo para CSV (RFC 4180): si trae coma, comilla o salto de linea,
/// se encierra entre comillas y se duplican las comillas internas.
fn csv_escape(field: &str) -> String {
    if field.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

/// Valor de una columna para un hallazgo dado (1-based `n`).
fn value_for(col: &str, n: usize, f: &pudureport_core::models::Finding) -> String {
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
            .map(|c| csv_escape(&value_for(c, i + 1, f)))
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
/// expone el cuerpo/PoC del hallazgo.
fn json_value_for(col: &str, n: usize, f: &Finding) -> Value {
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
        _ => Value::Null,
    }
}

/// Arma el payload JSON de exportacion para un proyecto y un destino, con el
/// esquema estable definido por `target.fields`. Puro (no hace red): la UI lo
/// usa para mostrar la vista previa exacta de lo que se enviara. Excluye los
/// hallazgos ocultos, igual que el PDF y el CSV, y nunca incluye el cuerpo.
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
                obj.insert(field.clone(), json_value_for(field, i + 1, f));
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
}
