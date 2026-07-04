// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Secciones del cuerpo de un hallazgo (Descripcion/Impacto/PoC/Remediacion).
//! Espeja `src/lib/sections.ts` (`FINDING_SECTIONS`): mismas claves, mismo
//! orden. Solo se usa para filtrar secciones ocultas antes de exportar el
//! PDF; el parseo/edicion por secciones para la UI vive en el frontend.

/// (clave, titulo canonico), mismo orden que `FINDING_SECTIONS` en TS.
const SECTIONS: [(&str, &str); 4] = [
    ("descripcion", "Descripcion"),
    ("impacto", "Impacto"),
    ("poc", "Prueba de concepto"),
    ("remediacion", "Remediacion"),
];

/// Si `line` es un encabezado `## Titulo` (dos numerales, un espacio y
/// texto), devuelve el titulo recortado. None si no matchea (incluye
/// "### ..." y "##sinespacio", igual que el regex `^##\s+(.+?)\s*$` del TS).
fn heading_title(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("##")?;
    if !rest.starts_with(|c: char| c.is_whitespace()) {
        return None;
    }
    let title = rest.trim();
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

/// Clave de seccion para un titulo de encabezado, case-insensitive (ASCII).
fn key_for_title(title: &str) -> Option<&'static str> {
    SECTIONS
        .iter()
        .find(|(_, t)| t.eq_ignore_ascii_case(title))
        .map(|(k, _)| *k)
}

/// Quita el contenido de las secciones del `body` cuya clave este en
/// `hidden` (encabezado incluido). Las lineas antes del primer encabezado
/// reconocido se tratan como parte de "descripcion", igual que
/// `parseSections` en el TS. Si `hidden` esta vacio devuelve el body sin
/// tocar.
///
/// El matching de titulos es case-insensitive pero, a diferencia del TS, no
/// normaliza acentos: el editor de la app siempre escribe los titulos
/// canonicos sin tildes (`joinSections`), asi que un body editado a mano con
/// tildes en el titulo simplemente no oculta esa seccion (modo de falla
/// seguro: no se pierde texto, solo no se oculta).
pub fn strip_hidden_sections(body: &str, hidden: &[String]) -> String {
    if hidden.is_empty() {
        return body.to_string();
    }

    let mut out = String::new();
    let mut current_hidden = hidden.iter().any(|h| h == SECTIONS[0].0);
    for line in body.lines() {
        if let Some(title) = heading_title(line) {
            if let Some(key) = key_for_title(title) {
                current_hidden = hidden.iter().any(|h| h == key);
                if !current_hidden {
                    out.push_str(line);
                    out.push('\n');
                }
                continue;
            }
        }
        if !current_hidden {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const BODY: &str = "## Descripcion\n\nTexto A\n\n## Impacto\n\nTexto B\n\n## Prueba de concepto\n\nTexto C\n\n## Remediacion\n\nTexto D\n";

    #[test]
    fn no_hidden_returns_body_unchanged() {
        assert_eq!(strip_hidden_sections(BODY, &[]), BODY);
    }

    #[test]
    fn hides_middle_section() {
        let out = strip_hidden_sections(BODY, &["poc".to_string()]);
        assert!(out.contains("Descripcion"));
        assert!(out.contains("Texto A"));
        assert!(out.contains("Impacto"));
        assert!(out.contains("Texto B"));
        assert!(!out.contains("Prueba de concepto"));
        assert!(!out.contains("Texto C"));
        assert!(out.contains("Remediacion"));
        assert!(out.contains("Texto D"));
    }

    #[test]
    fn hides_several_sections() {
        let hidden = vec!["poc".to_string(), "remediacion".to_string()];
        let out = strip_hidden_sections(BODY, &hidden);
        assert!(out.contains("Texto A"));
        assert!(out.contains("Texto B"));
        assert!(!out.contains("Texto C"));
        assert!(!out.contains("Texto D"));
    }

    #[test]
    fn title_matching_is_case_insensitive() {
        let body = "## descripcion\n\nTexto A\n\n## IMPACTO\n\nTexto B\n";
        let out = strip_hidden_sections(body, &["impacto".to_string()]);
        assert!(out.contains("Texto A"));
        assert!(!out.contains("Texto B"));
    }

    #[test]
    fn preamble_before_first_heading_follows_descripcion() {
        let body = "Texto suelto antes de cualquier encabezado.\n\n## Impacto\n\nTexto B\n";
        let out = strip_hidden_sections(body, &["descripcion".to_string()]);
        assert!(!out.contains("Texto suelto"));
        assert!(out.contains("Texto B"));
    }

    #[test]
    fn unknown_heading_stays_as_content_of_current_section() {
        let body = "## Descripcion\n\nTexto A\n\n### Nota interna\n\nTexto extra\n\n## Impacto\n\nTexto B\n";
        let out = strip_hidden_sections(body, &["impacto".to_string()]);
        assert!(out.contains("Nota interna"));
        assert!(out.contains("Texto extra"));
        assert!(!out.contains("Texto B"));
    }
}
