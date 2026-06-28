// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Calculo de puntaje CVSS 3.1 y 4.0.
//!
//! 3.1: formula oficial del documento de especificacion de FIRST.org.
//! 4.0: algoritmo MacroVector oficial con la tabla de lookup de la
//! implementacion de referencia (cvss-v4-calculator, BSD-2-Clause).
//!
//! La severidad se deriva del puntaje; nunca se edita a mano.

use std::collections::HashMap;

use crate::models::{CvssResult, CvssVersion, Severity};

#[derive(Debug, thiserror::Error)]
pub enum CvssError {
    #[error("vector CVSS vacio")]
    Empty,
    #[error("metrica obligatoria faltante: {0}")]
    MissingMetric(String),
    #[error("valor invalido para la metrica {metric}: {value}")]
    InvalidValue { metric: String, value: String },
    #[error("MacroVector sin entrada en la tabla de lookup: {0}")]
    UnknownMacroVector(String),
}

/// Punto de entrada: calcula puntaje y severidad de un vector segun su version.
pub fn calc(version: CvssVersion, vector: &str) -> Result<CvssResult, CvssError> {
    let vector = vector.trim();
    if vector.is_empty() {
        return Err(CvssError::Empty);
    }
    let score = match version {
        CvssVersion::V31 => score_v31(vector)?,
        CvssVersion::V40 => score_v40(vector)?,
    };
    Ok(CvssResult {
        score,
        severity: Severity::from_score(score),
        vector: vector.to_string(),
    })
}

/// Parsea un vector "CVSS:x/AV:N/..." a un mapa metrica -> valor.
/// Ignora el prefijo "CVSS:..." inicial.
fn parse_vector(vector: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for part in vector.split('/') {
        if let Some((k, v)) = part.split_once(':') {
            if k == "CVSS" {
                continue;
            }
            map.insert(k.to_string(), v.to_string());
        }
    }
    map
}

// ---------------------------------------------------------------------------
// CVSS 3.1
// ---------------------------------------------------------------------------

fn score_v31(vector: &str) -> Result<f64, CvssError> {
    let m = parse_vector(vector);

    let get = |k: &str| -> Result<&str, CvssError> {
        m.get(k)
            .map(|s| s.as_str())
            .ok_or_else(|| CvssError::MissingMetric(k.to_string()))
    };

    let av = get("AV")?;
    let ac = get("AC")?;
    let pr = get("PR")?;
    let ui = get("UI")?;
    let s = get("S")?;
    let c = get("C")?;
    let i = get("I")?;
    let a = get("A")?;

    let scope_changed = match s {
        "U" => false,
        "C" => true,
        other => {
            return Err(CvssError::InvalidValue {
                metric: "S".into(),
                value: other.into(),
            })
        }
    };

    let av_w = match av {
        "N" => 0.85,
        "A" => 0.62,
        "L" => 0.55,
        "P" => 0.2,
        other => return Err(invalid("AV", other)),
    };
    let ac_w = match ac {
        "L" => 0.77,
        "H" => 0.44,
        other => return Err(invalid("AC", other)),
    };
    let pr_w = match (pr, scope_changed) {
        ("N", _) => 0.85,
        ("L", false) => 0.62,
        ("L", true) => 0.68,
        ("H", false) => 0.27,
        ("H", true) => 0.5,
        (other, _) => return Err(invalid("PR", other)),
    };
    let ui_w = match ui {
        "N" => 0.85,
        "R" => 0.62,
        other => return Err(invalid("UI", other)),
    };

    let cia = |metric: &str, v: &str| -> Result<f64, CvssError> {
        match v {
            "H" => Ok(0.56),
            "L" => Ok(0.22),
            "N" => Ok(0.0),
            other => Err(invalid(metric, other)),
        }
    };
    let c_w = cia("C", c)?;
    let i_w = cia("I", i)?;
    let a_w = cia("A", a)?;

    let iss = 1.0 - ((1.0 - c_w) * (1.0 - i_w) * (1.0 - a_w));
    let impact = if scope_changed {
        7.52 * (iss - 0.029) - 3.25 * (iss - 0.02).powi(15)
    } else {
        6.42 * iss
    };
    let exploitability = 8.22 * av_w * ac_w * pr_w * ui_w;

    let base = if impact <= 0.0 {
        0.0
    } else if scope_changed {
        roundup(f64::min(1.08 * (impact + exploitability), 10.0))
    } else {
        roundup(f64::min(impact + exploitability, 10.0))
    };

    Ok(base)
}

fn invalid(metric: &str, value: &str) -> CvssError {
    CvssError::InvalidValue {
        metric: metric.to_string(),
        value: value.to_string(),
    }
}

/// Redondeo hacia arriba a un decimal segun la especificacion CVSS 3.1.
fn roundup(input: f64) -> f64 {
    let int_input = (input * 100_000.0).round() as i64;
    if int_input % 10_000 == 0 {
        int_input as f64 / 100_000.0
    } else {
        ((int_input as f64 / 10_000.0).floor() + 1.0) / 10.0
    }
}

// ---------------------------------------------------------------------------
// CVSS 4.0
// ---------------------------------------------------------------------------

include!("cvss4_lookup.rs");

fn lookup_v40(macro_vector: &str) -> Option<f64> {
    CVSS4_LOOKUP
        .binary_search_by(|(k, _)| k.cmp(&macro_vector))
        .ok()
        .map(|idx| CVSS4_LOOKUP[idx].1)
}

/// Resuelve el valor efectivo de una metrica aplicando los defaults del
/// estandar y las metricas modificadas (M*). Equivalente a `m()` de la
/// implementacion de referencia.
fn mval(metrics: &HashMap<String, String>, metric: &str) -> String {
    let selected = metrics.get(metric).map(|s| s.as_str()).unwrap_or("X");

    // Defaults al peor caso para metricas Threat/Environmental no definidas.
    if metric == "E" && selected == "X" {
        return "A".to_string();
    }
    if (metric == "CR" || metric == "IR" || metric == "AR") && selected == "X" {
        return "H".to_string();
    }

    // Las metricas modificadas (M*) sobreescriben la base si estan definidas.
    let modified_key = format!("M{metric}");
    if let Some(modified) = metrics.get(&modified_key) {
        if modified != "X" {
            return modified.clone();
        }
    }

    selected.to_string()
}

fn score_v40(vector: &str) -> Result<f64, CvssError> {
    let metrics = parse_vector(vector);

    // Validar presencia de las metricas base obligatorias.
    for base in [
        "AV", "AC", "AT", "PR", "UI", "VC", "VI", "VA", "SC", "SI", "SA",
    ] {
        if !metrics.contains_key(base) {
            return Err(CvssError::MissingMetric(base.to_string()));
        }
    }

    // Atajo: sin impacto en ningun sistema -> 0.0
    if ["VC", "VI", "VA", "SC", "SI", "SA"]
        .iter()
        .all(|k| mval(&metrics, k) == "N")
    {
        return Ok(0.0);
    }

    let mv = macro_vector(&metrics);
    let mut value = lookup_v40(&mv).ok_or_else(|| CvssError::UnknownMacroVector(mv.clone()))?;

    let eq: Vec<u32> = mv.chars().map(|c| c.to_digit(10).unwrap_or(0)).collect();
    let (eq1, eq2, eq3, eq4, eq5, eq6) = (eq[0], eq[1], eq[2], eq[3], eq[4], eq[5]);

    // MacroVectors inmediatamente inferiores en cada eje.
    let eq1_next = format!("{}{}{}{}{}{}", eq1 + 1, eq2, eq3, eq4, eq5, eq6);
    let eq2_next = format!("{}{}{}{}{}{}", eq1, eq2 + 1, eq3, eq4, eq5, eq6);
    let eq4_next = format!("{}{}{}{}{}{}", eq1, eq2, eq3, eq4 + 1, eq5, eq6);
    let eq5_next = format!("{}{}{}{}{}{}", eq1, eq2, eq3, eq4, eq5 + 1, eq6);

    let score_eq1_next = lookup_v40(&eq1_next);
    let score_eq2_next = lookup_v40(&eq2_next);
    let score_eq4_next = lookup_v40(&eq4_next);
    let score_eq5_next = lookup_v40(&eq5_next);

    // eq3 y eq6 estan acopladas.
    let score_eq3eq6_next: Option<f64> = if eq3 == 0 && eq6 == 0 {
        let left = format!("{}{}{}{}{}{}", eq1, eq2, eq3, eq4, eq5, eq6 + 1);
        let right = format!("{}{}{}{}{}{}", eq1, eq2, eq3 + 1, eq4, eq5, eq6);
        match (lookup_v40(&left), lookup_v40(&right)) {
            (Some(l), Some(r)) => Some(l.max(r)),
            (Some(l), None) => Some(l),
            (None, Some(r)) => Some(r),
            (None, None) => None,
        }
    } else {
        // eq6==1: el inferior avanza en eq3. eq3==1 (con eq6==0): avanza en eq6.
        // Caso 21: ambos avanzan (no existe en la tabla, devolvera None).
        let next = if eq6 == 1 {
            format!("{}{}{}{}{}{}", eq1, eq2, eq3 + 1, eq4, eq5, eq6)
        } else if eq3 == 1 {
            format!("{}{}{}{}{}{}", eq1, eq2, eq3, eq4, eq5, eq6 + 1)
        } else {
            format!("{}{}{}{}{}{}", eq1, eq2, eq3 + 1, eq4, eq5, eq6 + 1)
        };
        lookup_v40(&next)
    };

    // Vectores de maxima severidad por eje, compuestos en combinaciones.
    let eq1_maxes = eq_maxes("eq1", eq1);
    let eq2_maxes = eq_maxes("eq2", eq2);
    let eq3_eq6_maxes = eq3_maxes(eq3, eq6);
    let eq4_maxes = eq_maxes("eq4", eq4);
    let eq5_maxes = eq_maxes("eq5", eq5);

    let mut max_vectors: Vec<String> = Vec::new();
    for m1 in &eq1_maxes {
        for m2 in &eq2_maxes {
            for m36 in &eq3_eq6_maxes {
                for m4 in &eq4_maxes {
                    for m5 in &eq5_maxes {
                        max_vectors.push(format!("{m1}{m2}{m36}{m4}{m5}"));
                    }
                }
            }
        }
    }

    // Distancias de severidad respecto al primer max_vector alcanzable.
    let levels = MetricLevels::new();
    let mut sd: SeverityDistances = SeverityDistances::default();
    for max_vector in &max_vectors {
        let candidate = levels.distances(&metrics, max_vector);
        if candidate.any_negative() {
            continue;
        }
        sd = candidate;
        break;
    }

    let current_eq1 = sd.av + sd.pr + sd.ui;
    let current_eq2 = sd.ac + sd.at;
    let current_eq3eq6 = sd.vc + sd.vi + sd.va + sd.cr + sd.ir + sd.ar;
    let current_eq4 = sd.sc + sd.si + sd.sa;

    let step = 0.1;
    let max_sev_eq1 = max_severity_eq1(eq1) * step;
    let max_sev_eq2 = max_severity_eq2(eq2) * step;
    let max_sev_eq3eq6 = max_severity_eq3eq6(eq3, eq6) * step;
    let max_sev_eq4 = max_severity_eq4(eq4) * step;

    let mut n_existing_lower = 0u32;
    let mut normalized = 0.0;

    if let Some(next) = score_eq1_next {
        n_existing_lower += 1;
        let available = value - next;
        let pct = current_eq1 / max_sev_eq1;
        normalized += available * pct;
    }
    if let Some(next) = score_eq2_next {
        n_existing_lower += 1;
        let available = value - next;
        let pct = current_eq2 / max_sev_eq2;
        normalized += available * pct;
    }
    if let Some(next) = score_eq3eq6_next {
        n_existing_lower += 1;
        let available = value - next;
        let pct = current_eq3eq6 / max_sev_eq3eq6;
        normalized += available * pct;
    }
    if let Some(next) = score_eq4_next {
        n_existing_lower += 1;
        let available = value - next;
        let pct = current_eq4 / max_sev_eq4;
        normalized += available * pct;
    }
    if score_eq5_next.is_some() {
        // Para eq5 el porcentaje es siempre 0.
        n_existing_lower += 1;
    }

    let mean_distance = if n_existing_lower == 0 {
        0.0
    } else {
        normalized / n_existing_lower as f64
    };

    value = (value - mean_distance).clamp(0.0, 10.0);
    Ok((value * 10.0).round() / 10.0)
}

fn macro_vector(m: &HashMap<String, String>) -> String {
    // EQ1
    let av = mval(m, "AV");
    let pr = mval(m, "PR");
    let ui = mval(m, "UI");
    let eq1 = if av == "N" && pr == "N" && ui == "N" {
        0
    } else if (av == "N" || pr == "N" || ui == "N")
        && !(av == "N" && pr == "N" && ui == "N")
        && av != "P"
    {
        1
    } else {
        2
    };

    // EQ2
    let ac = mval(m, "AC");
    let at = mval(m, "AT");
    let eq2 = if ac == "L" && at == "N" { 0 } else { 1 };

    // EQ3
    let vc = mval(m, "VC");
    let vi = mval(m, "VI");
    let va = mval(m, "VA");
    let eq3 = if vc == "H" && vi == "H" {
        0
    } else if vc == "H" || vi == "H" || va == "H" {
        1
    } else {
        2
    };

    // EQ4 (usa metricas modificadas de impacto en subsistema)
    let msi = mval(m, "MSI");
    let msa = mval(m, "MSA");
    let sc = mval(m, "SC");
    let si = mval(m, "SI");
    let sa = mval(m, "SA");
    let eq4 = if msi == "S" || msa == "S" {
        0
    } else if sc == "H" || si == "H" || sa == "H" {
        1
    } else {
        2
    };

    // EQ5 (madurez del exploit)
    let e = mval(m, "E");
    let eq5 = if e == "A" {
        0
    } else if e == "P" {
        1
    } else {
        2
    };

    // EQ6 (requisitos de seguridad cruzados con impacto)
    let cr = mval(m, "CR");
    let ir = mval(m, "IR");
    let ar = mval(m, "AR");
    let eq6 = if (cr == "H" && vc == "H") || (ir == "H" && vi == "H") || (ar == "H" && va == "H") {
        0
    } else {
        1
    };

    format!("{eq1}{eq2}{eq3}{eq4}{eq5}{eq6}")
}

/// Maximos por eje (maxComposed) para EQ1, EQ2, EQ4, EQ5.
fn eq_maxes(eq: &str, level: u32) -> Vec<&'static str> {
    match (eq, level) {
        ("eq1", 0) => vec!["AV:N/PR:N/UI:N/"],
        ("eq1", 1) => vec!["AV:A/PR:N/UI:N/", "AV:N/PR:L/UI:N/", "AV:N/PR:N/UI:P/"],
        ("eq1", _) => vec!["AV:P/PR:N/UI:N/", "AV:A/PR:L/UI:P/"],
        ("eq2", 0) => vec!["AC:L/AT:N/"],
        ("eq2", _) => vec!["AC:H/AT:N/", "AC:L/AT:P/"],
        ("eq4", 0) => vec!["SC:H/SI:S/SA:S/"],
        ("eq4", 1) => vec!["SC:H/SI:H/SA:H/"],
        ("eq4", _) => vec!["SC:L/SI:L/SA:L/"],
        ("eq5", 0) => vec!["E:A/"],
        ("eq5", 1) => vec!["E:P/"],
        ("eq5", _) => vec!["E:U/"],
        _ => vec![],
    }
}

/// Maximos acoplados para EQ3+EQ6 (maxComposed["eq3"][eq3][eq6]).
fn eq3_maxes(eq3: u32, eq6: u32) -> Vec<&'static str> {
    match (eq3, eq6) {
        (0, 0) => vec!["VC:H/VI:H/VA:H/CR:H/IR:H/AR:H/"],
        (0, 1) => vec![
            "VC:H/VI:H/VA:L/CR:M/IR:M/AR:H/",
            "VC:H/VI:H/VA:H/CR:M/IR:M/AR:M/",
        ],
        (1, 0) => vec![
            "VC:L/VI:H/VA:H/CR:H/IR:H/AR:H/",
            "VC:H/VI:L/VA:H/CR:H/IR:H/AR:H/",
        ],
        (1, 1) => vec![
            "VC:L/VI:H/VA:L/CR:H/IR:M/AR:H/",
            "VC:L/VI:H/VA:H/CR:H/IR:M/AR:M/",
            "VC:H/VI:L/VA:H/CR:M/IR:H/AR:M/",
            "VC:H/VI:L/VA:L/CR:M/IR:H/AR:H/",
            "VC:L/VI:L/VA:H/CR:H/IR:H/AR:M/",
        ],
        (2, 1) => vec!["VC:L/VI:L/VA:L/CR:H/IR:H/AR:H/"],
        _ => vec![],
    }
}

fn max_severity_eq1(level: u32) -> f64 {
    match level {
        0 => 1.0,
        1 => 4.0,
        _ => 5.0,
    }
}
fn max_severity_eq2(level: u32) -> f64 {
    match level {
        0 => 1.0,
        _ => 2.0,
    }
}
fn max_severity_eq3eq6(eq3: u32, eq6: u32) -> f64 {
    match (eq3, eq6) {
        (0, 0) => 7.0,
        (0, 1) => 6.0,
        (1, 0) => 8.0,
        (1, 1) => 8.0,
        (2, 1) => 10.0,
        _ => 1.0,
    }
}
fn max_severity_eq4(level: u32) -> f64 {
    match level {
        0 => 6.0,
        1 => 5.0,
        _ => 4.0,
    }
}

/// Tabla de niveles de severidad por valor de metrica (de cvss_score.js).
struct MetricLevels;

impl MetricLevels {
    fn new() -> Self {
        MetricLevels
    }

    fn level(metric: &str, value: &str) -> f64 {
        let table: &[(&str, f64)] = match metric {
            "AV" => &[("N", 0.0), ("A", 0.1), ("L", 0.2), ("P", 0.3)],
            "PR" => &[("N", 0.0), ("L", 0.1), ("H", 0.2)],
            "UI" => &[("N", 0.0), ("P", 0.1), ("A", 0.2)],
            "AC" => &[("L", 0.0), ("H", 0.1)],
            "AT" => &[("N", 0.0), ("P", 0.1)],
            "VC" | "VI" | "VA" => &[("H", 0.0), ("L", 0.1), ("N", 0.2)],
            "SC" => &[("H", 0.1), ("L", 0.2), ("N", 0.3)],
            "SI" | "SA" => &[("S", 0.0), ("H", 0.1), ("L", 0.2), ("N", 0.3)],
            "CR" | "IR" | "AR" => &[("H", 0.0), ("M", 0.1), ("L", 0.2)],
            _ => &[],
        };
        table
            .iter()
            .find(|(k, _)| *k == value)
            .map(|(_, v)| *v)
            .unwrap_or(0.0)
    }

    fn distances(&self, metrics: &HashMap<String, String>, max_vector: &str) -> SeverityDistances {
        let dist = |metric: &str| -> f64 {
            let selected = mval(metrics, metric);
            let max = extract_metric(metric, max_vector);
            Self::level(metric, &selected) - Self::level(metric, &max)
        };
        SeverityDistances {
            av: dist("AV"),
            pr: dist("PR"),
            ui: dist("UI"),
            ac: dist("AC"),
            at: dist("AT"),
            vc: dist("VC"),
            vi: dist("VI"),
            va: dist("VA"),
            sc: dist("SC"),
            si: dist("SI"),
            sa: dist("SA"),
            cr: dist("CR"),
            ir: dist("IR"),
            ar: dist("AR"),
        }
    }
}

#[derive(Default)]
struct SeverityDistances {
    av: f64,
    pr: f64,
    ui: f64,
    ac: f64,
    at: f64,
    vc: f64,
    vi: f64,
    va: f64,
    sc: f64,
    si: f64,
    sa: f64,
    cr: f64,
    ir: f64,
    ar: f64,
}

impl SeverityDistances {
    fn any_negative(&self) -> bool {
        [
            self.av, self.pr, self.ui, self.ac, self.at, self.vc, self.vi, self.va, self.sc,
            self.si, self.sa, self.cr, self.ir, self.ar,
        ]
        .iter()
        .any(|&d| d < 0.0)
    }
}

/// Extrae el valor de una metrica de un vector compuesto "AV:N/PR:N/...".
fn extract_metric(metric: &str, vector: &str) -> String {
    let needle = format!("{metric}:");
    if let Some(pos) = vector.find(&needle) {
        let rest = &vector[pos + needle.len()..];
        match rest.find('/') {
            Some(end) => rest[..end].to_string(),
            None => rest.to_string(),
        }
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s31(v: &str) -> f64 {
        score_v31(v).unwrap()
    }
    fn s40(v: &str) -> f64 {
        score_v40(v).unwrap()
    }

    // --- CVSS 3.1 ---

    #[test]
    fn v31_critical_full() {
        // Vector de ejemplo del README.dev.md tiene A:N; aqui el clasico 9.8.
        let v = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
        assert_eq!(s31(v), 9.8);
        assert_eq!(Severity::from_score(s31(v)), Severity::Critical);
    }

    #[test]
    fn v31_high_no_availability() {
        let v = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N";
        assert_eq!(s31(v), 9.1);
        assert_eq!(Severity::from_score(9.1), Severity::Critical);
    }

    #[test]
    fn v31_scope_changed() {
        let v = "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H";
        assert_eq!(s31(v), 9.6);
    }

    #[test]
    fn v31_medium() {
        let v = "CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:L/I:L/A:N";
        assert_eq!(s31(v), 3.7);
        assert_eq!(Severity::from_score(3.7), Severity::Low);
    }

    #[test]
    fn v31_none() {
        let v = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N";
        assert_eq!(s31(v), 0.0);
        assert_eq!(Severity::from_score(0.0), Severity::Info);
    }

    #[test]
    fn v31_local_priv() {
        let v = "CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H";
        assert_eq!(s31(v), 7.8);
    }

    #[test]
    fn v31_missing_metric_errors() {
        assert!(score_v31("CVSS:3.1/AV:N/AC:L").is_err());
    }

    // --- CVSS 4.0 ---

    #[test]
    fn v40_critical_full() {
        let v = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H";
        assert_eq!(s40(v), 10.0);
    }

    #[test]
    fn v40_no_impact_is_zero() {
        let v = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N";
        assert_eq!(s40(v), 0.0);
    }

    #[test]
    fn v40_known_vector() {
        // Verificado contra la implementacion de referencia de FIRST.org.
        let v = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:P/VC:L/VI:L/VA:N/SC:N/SI:N/SA:N";
        assert_eq!(s40(v), 5.3);
    }

    #[test]
    fn v40_local_high() {
        let v = "CVSS:4.0/AV:L/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N";
        assert_eq!(s40(v), 8.6);
    }

    #[test]
    fn v40_missing_base_errors() {
        assert!(score_v40("CVSS:4.0/AV:N/AC:L").is_err());
    }

    #[test]
    fn calc_dispatches_by_version() {
        let r = calc(
            CvssVersion::V31,
            "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
        )
        .unwrap();
        assert_eq!(r.score, 9.8);
        assert_eq!(r.severity, Severity::Critical);
    }
}
