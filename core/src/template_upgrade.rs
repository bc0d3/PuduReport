// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Actualiza copias de plantillas `.typ` hechas antes del orden configurable
//! de campos de hallazgo (bloque "Hallazgos" con `config.fields`).
//!
//! Esas copias dibujan cada hallazgo con codigo fijo y no respetan el orden ni
//! los saltos que el usuario configura en Reporte. La actualizacion es
//! quirurgica: reemplaza SOLO el tramo que dibuja el detalle de hallazgos por
//! el de la plantilla incluida equivalente, y conserva todo lo demas de la
//! copia (portada, estilos, textos propios). El tramo nuevo se toma de las
//! plantillas incluidas en el binario, asi nunca se desincroniza de ellas.

const PENTEST: &str = include_str!("../../templates/pentest.typ");
const RETEST: &str = include_str!("../../templates/retest.typ");

const PENTEST_MARKER: &str = "// Detalle de hallazgos:";
const RETEST_MARKER: &str = "// Retest: franja por estado";
const RENDER_BLOCK: &str = "#let render-block(b) = {";
const OLD_BLOCK_FINDINGS: &str = "#let block-findings() = {";
const OLD_FINDINGS_DETAIL: &str = "#let findings-detail(";
const OLD_CALL: &str = "block-findings()";
const NEW_CALL: &str = "block-findings(b.at(\"config\", default: (:)))";
const THEME_IMPORT: &str = "#import \"theme.typ\": *";

/// Resultado de intentar actualizar una plantilla.
#[derive(Debug, PartialEq, Eq)]
pub enum Upgrade {
    /// Devuelve la fuente nueva.
    Upgraded(String),
    /// Ya dibuja los hallazgos con el orden configurable.
    AlreadySupported,
    /// No tiene la estructura esperada (no se toca: hay que usar una incluida).
    Unsupported,
}

/// Si la fuente ya respeta `config.fields` del bloque "Hallazgos".
pub fn supports_finding_fields(source: &str) -> bool {
    source.contains("render-finding(")
}

/// Tramo de la plantilla incluida (pentest o retest, segun `marker`) desde el
/// comentario marcador hasta `render-block`.
fn builtin_segment(marker: &str) -> Option<&'static str> {
    let src = if marker == RETEST_MARKER {
        RETEST
    } else {
        PENTEST
    };
    let start = src.find(marker)?;
    let end = start + src[start..].find(RENDER_BLOCK)?;
    Some(&src[start..end])
}

/// Reemplaza el detalle de hallazgos de una copia antigua por el configurable.
/// Si la copia es de retest (tiene `findings-detail`), usa el tramo de retest.
pub fn upgrade_source(source: &str) -> Upgrade {
    if supports_finding_fields(source) {
        return Upgrade::AlreadySupported;
    }
    let Some(block_findings) = source.find(OLD_BLOCK_FINDINGS) else {
        return Upgrade::Unsupported;
    };
    let (start, marker) = match source.find(OLD_FINDINGS_DETAIL) {
        Some(detail) if detail < block_findings => (detail, RETEST_MARKER),
        _ => (block_findings, PENTEST_MARKER),
    };
    let Some(end) = source[start..].find(RENDER_BLOCK).map(|e| start + e) else {
        return Upgrade::Unsupported;
    };
    let tail = &source[end..];
    if !tail.contains(OLD_CALL) {
        return Upgrade::Unsupported;
    }
    let Some(segment) = builtin_segment(marker) else {
        return Upgrade::Unsupported;
    };

    let mut out = format!(
        "{}{}{}",
        &source[..start],
        segment,
        tail.replace(OLD_CALL, NEW_CALL)
    );
    // render-finding y finding-fields viven en theme.typ: las copias muy
    // viejas no lo importaban. Una definicion local posterior sigue ganando.
    if !out.contains(THEME_IMPORT) {
        out = format!("{THEME_IMPORT}\n\n{out}");
    }
    Upgrade::Upgraded(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OLD_PENTEST: &str = include_str!("../tests/fixtures/pentest-v0.0.25.typ");
    const OLD_RETEST: &str = include_str!("../tests/fixtures/retest-v0.0.25.typ");

    #[test]
    fn builtins_already_support_fields_and_expose_segments() {
        assert!(supports_finding_fields(PENTEST));
        assert!(supports_finding_fields(RETEST));
        assert_eq!(upgrade_source(PENTEST), Upgrade::AlreadySupported);
        assert!(builtin_segment(PENTEST_MARKER)
            .unwrap()
            .contains("render-finding("));
        assert!(builtin_segment(RETEST_MARKER)
            .unwrap()
            .contains("retest-chip"));
    }

    #[test]
    fn upgrades_old_pentest_copy_keeping_custom_parts() {
        let custom = OLD_PENTEST.replace("[Indice de hallazgos]", "[MI INDICE PROPIO]");
        assert!(
            custom.contains("MI INDICE PROPIO"),
            "fixture sin el titulo esperado"
        );
        let Upgrade::Upgraded(out) = upgrade_source(&custom) else {
            panic!("deberia actualizarse");
        };
        assert!(supports_finding_fields(&out));
        assert!(out.contains("MI INDICE PROPIO"));
        assert!(out.contains(NEW_CALL));
        assert!(!out.contains(OLD_CALL));
        assert!(out.contains("block-findings-index()"));
        assert_eq!(out.matches("#let render-block(b) = {").count(), 1);
        assert_eq!(out.matches("#let block-findings(cfg) = {").count(), 1);
        // Idempotente.
        assert_eq!(upgrade_source(&out), Upgrade::AlreadySupported);
    }

    #[test]
    fn upgrades_old_retest_copy_with_retest_segment() {
        let Upgrade::Upgraded(out) = upgrade_source(OLD_RETEST) else {
            panic!("deberia actualizarse");
        };
        assert!(out.contains("retest-chip"));
        assert!(out.contains("Detalle de verificacion"));
        assert_eq!(out.matches("#let findings-detail(").count(), 1);
        assert!(!out.contains(OLD_CALL));
    }

    #[test]
    fn adds_theme_import_when_missing() {
        let old = OLD_RETEST.replace(THEME_IMPORT, "");
        let Upgrade::Upgraded(out) = upgrade_source(&old) else {
            panic!("deberia actualizarse");
        };
        assert!(out.starts_with(THEME_IMPORT));
    }

    #[test]
    fn unsupported_structure_is_left_alone() {
        assert_eq!(upgrade_source("#let x = 1\n"), Upgrade::Unsupported);
        let no_call = OLD_PENTEST.replace("{ block-findings() }", "{ none }");
        assert_eq!(upgrade_source(&no_call), Upgrade::Unsupported);
    }
}
