// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Nombre de archivo estandar para los exports (PDF y CSV): `{Cliente}-{Tipo}-{fecha}`.
//! Los tipos de examen (oscp/htb) no usan esto: siguen su propia convencion de
//! submission, definida en `pdf.rs`.

use std::time::{SystemTime, UNIX_EPOCH};

use pudureport_core::models::ProjectMeta;

/// Reemplaza cualquier caracter no alfanumerico por un guion, colapsando
/// guiones consecutivos y recortando los bordes. Preserva mayusculas (a
/// diferencia del slug de directorio) para que el nombre siga siendo legible.
/// Cae a "Informe" si no queda nada.
pub fn sanitize_filename_part(s: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "Informe".to_string()
    } else {
        out
    }
}

/// Etiqueta corta y legible del tipo de proyecto, para nombres de archivo.
pub fn type_label_for_filename(project_type: &str) -> &'static str {
    match project_type {
        "pentest" => "Pentest",
        "redteam" => "RedTeam",
        "ejecutivo" => "Ejecutivo",
        "documento" => "Documento",
        "cti" => "CTI",
        "incidente" => "Incidente",
        "auditoria" => "Auditoria",
        "cumplimiento" => "Cumplimiento",
        "riesgos" => "Riesgos",
        "hunting" => "Hunting",
        "retest" => "Retest",
        _ => "Informe",
    }
}

/// Fecha de hoy en UTC, formato `YYYY-MM-DD`. Conversion directa desde
/// epoch (algoritmo civil_from_days de Howard Hinnant) para no depender de
/// un crate de fechas: evita el feature `local-offset` de crates como `time`,
/// que en Unix tiene problemas documentados de unsafe/threads.
fn today_utc_date() -> String {
    let days = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() / 86_400)
        .unwrap_or(0) as i64;

    // civil_from_days: dias desde 1970-01-01 -> (anio, mes, dia).
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}")
}

/// Nombre base (sin extension) para los exports estandar: `{Cliente}-{Tipo}-{fecha}`.
/// No se usa para los tipos de examen (oscp/htb), que tienen su propia convencion.
pub fn standard_basename(project: &ProjectMeta) -> String {
    let client = sanitize_filename_part(&project.client);
    let type_label = type_label_for_filename(&project.project_type);
    let date = today_utc_date();
    format!("{client}-{type_label}-{date}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_filename_part_basic() {
        assert_eq!(sanitize_filename_part("ACME Corp"), "ACME-Corp");
        assert_eq!(sanitize_filename_part("  "), "Informe");
        assert_eq!(
            sanitize_filename_part("Acme S.A. / Chile"),
            "Acme-S-A-Chile"
        );
        assert_eq!(sanitize_filename_part("Múltiples Áéíóú"), "M-ltiples");
    }

    #[test]
    fn type_label_known_and_unknown() {
        assert_eq!(type_label_for_filename("pentest"), "Pentest");
        assert_eq!(type_label_for_filename("redteam"), "RedTeam");
        assert_eq!(type_label_for_filename("algo-raro"), "Informe");
    }

    #[test]
    fn standard_basename_format() {
        let mut project = ProjectMeta {
            client: "ACME Corp".to_string(),
            project_type: "pentest".to_string(),
            ..Default::default()
        };
        let base = standard_basename(&project);
        assert!(base.starts_with("ACME-Corp-Pentest-"));
        assert_eq!(base.len(), "ACME-Corp-Pentest-".len() + "YYYY-MM-DD".len());

        project.client = "".to_string();
        assert!(standard_basename(&project).starts_with("Informe-Pentest-"));
    }
}
