// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Export de resumen de hallazgos a CSV. Genera una tabla plana (sin el cuerpo
//! ni la PoC) con las columnas que elija el usuario, para compartir un panorama
//! rapido (ej. por correo). Excluye los hallazgos ocultos, igual que el PDF.

use std::path::Path;

use pudureport_core::models::{FindingStatus, Severity};
use pudureport_core::workspace;

/// Etiqueta de la cabecera de cada columna soportada.
fn header_for(col: &str) -> &str {
    match col {
        "numero" => "#",
        "titulo" => "Titulo",
        "severidad" => "Severidad",
        "cvss" => "CVSS",
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
        "cwe" => f.meta.cwe.join(", "),
        "estado" => status_label(f.meta.status).to_string(),
        "afectados" => f.meta.affected.join("; "),
        "nuevo" => if f.meta.new_in_retest { "Si" } else { "" }.to_string(),
        _ => String::new(),
    }
}

/// Escribe `build/<project_id>-resumen.csv` con las columnas pedidas (en ese
/// orden) y devuelve la ruta. Excluye los hallazgos ocultos.
pub fn export_csv(root: &Path, project_id: &str, columns: &[String]) -> Result<String, String> {
    if columns.is_empty() {
        return Err("elegi al menos una columna".to_string());
    }
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
    let path = build_dir.join(format!("{project_id}-resumen.csv"));
    std::fs::write(&path, csv).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}
