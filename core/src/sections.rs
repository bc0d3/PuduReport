// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Secciones del cuerpo de un hallazgo (Descripcion/Impacto/PoC/Remediacion).
//! Espeja `src/lib/sections.ts` (`FINDING_SECTIONS`): mismas claves, mismo
//! orden y aliases. Edicion MCP y filtrado de secciones ocultas para PDF.

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

/// Titulos aceptados tambien por el editor TS; los archivos existentes no se migran.
fn key_for_title(title: &str) -> Option<&'static str> {
    let normalized: String = title
        .to_lowercase()
        .chars()
        .filter_map(|c| match c {
            '\u{0300}'..='\u{036f}' => None,
            'á' => Some('a'),
            'é' => Some('e'),
            'í' => Some('i'),
            'ó' => Some('o'),
            'ú' | 'ü' => Some('u'),
            other => Some(other),
        })
        .collect();
    match normalized.trim() {
        "descripcion" | "description" => Some("descripcion"),
        "impacto" | "impact" => Some("impacto"),
        "prueba de concepto" | "poc" | "proof of concept" => Some("poc"),
        "remediacion" | "remediation" => Some("remediacion"),
        _ => None,
    }
}

#[derive(Default)]
struct Fence(Option<(char, usize)>);

impl Fence {
    // Devuelve true para todas las lineas del bloque, incluida apertura/cierre.
    fn contains(&mut self, line: &str) -> bool {
        let trimmed = line.trim_start_matches(' ');
        let marker = if line.len() - trimmed.len() <= 3 {
            trimmed.chars().next().filter(|c| *c == '`' || *c == '~')
        } else {
            None
        };
        let count = marker.map_or(0, |m| trimmed.chars().take_while(|c| *c == m).count());
        if let Some((m, n)) = self.0 {
            if marker == Some(m) && count >= n && trimmed[count..].trim().is_empty() {
                self.0 = None;
            }
            return true;
        }
        if count >= 3 && !(marker == Some('`') && trimmed[count..].contains('`')) {
            self.0 = marker.map(|m| (m, count));
            return true;
        }
        false
    }
}

fn headings(body: &str) -> Vec<(usize, &'static str)> {
    let mut fence = Fence::default();
    let mut offset = 0;
    let mut out = Vec::new();
    for line in body.split_inclusive('\n') {
        if !fence.contains(line) {
            if let Some(key) = heading_title(line).and_then(key_for_title) {
                out.push((offset, key));
            }
        }
        offset += line.len();
    }
    out
}

/// Reemplaza una sola seccion conservando literalmente el resto del cuerpo.
/// Rechaza encabezados ambiguos para no eliminar contenido por accidente.
pub fn update_section(body: &str, key: &str, content: &str) -> Result<String, String> {
    let title = SECTIONS
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, title)| *title)
        .ok_or("seccion invalida: use descripcion, impacto, poc o remediacion")?;
    if !headings(content).is_empty() {
        return Err("envie solo el contenido de la seccion; use ### para subtitulos".into());
    }
    let mut content_fence = Fence::default();
    for line in content.lines() {
        content_fence.contains(line);
    }
    if content_fence.0.is_some() {
        return Err("cierre el bloque de codigo del contenido antes de guardar".into());
    }
    let mut spans = headings(body);
    if spans.first().map_or(true, |(offset, _)| *offset > 0) && !body.trim().is_empty() {
        // El preambulo pertenece a Descripcion, igual que en la UI.
        if spans
            .first()
            .map_or(true, |(offset, _)| !body[..*offset].trim().is_empty())
        {
            spans.insert(0, (0, "descripcion"));
        }
    }
    let matches: Vec<_> = spans
        .iter()
        .enumerate()
        .filter(|(_, (_, k))| *k == key)
        .collect();
    if matches.len() > 1 {
        return Err("seccion repetida: revise el cuerpo con get_finding antes de editar".into());
    }
    let replacement = format!("## {title}\n\n{}\n\n", content.trim());
    if let Some((index, (start, _))) = matches.first() {
        let end = spans
            .get(index + 1)
            .map_or(body.len(), |(offset, _)| *offset);
        Ok(format!(
            "{}{}{}",
            &body[..*start],
            replacement,
            &body[end..]
        ))
    } else {
        // No anexar dentro de un bloque de codigo sin cerrar.
        let mut fence = Fence::default();
        for line in body.lines() {
            fence.contains(line);
        }
        if fence.0.is_some() {
            return Err("cierre el bloque de codigo antes de agregar una seccion".into());
        }
        // Insertar antes de la siguiente seccion canonica, igual que la UI.
        // No reordenar ni reescribir las secciones que ya existen.
        let rank = |candidate: &str| SECTIONS.iter().position(|(k, _)| *k == candidate);
        let insert_at = spans
            .iter()
            .find(|(_, candidate)| rank(candidate) > rank(key))
            .map_or(body.len(), |(offset, _)| *offset);
        Ok(format!(
            "{}\n\n{replacement}{}",
            &body[..insert_at],
            &body[insert_at..]
        ))
    }
}

/// Quita el contenido de las secciones del `body` cuya clave este en
/// `hidden` (encabezado incluido). Las lineas antes del primer encabezado
/// reconocido se tratan como parte de "descripcion", igual que
/// `parseSections` en el TS. Si `hidden` esta vacio devuelve el body sin
/// tocar.
///
pub fn strip_hidden_sections(body: &str, hidden: &[String]) -> String {
    if hidden.is_empty() {
        return body.to_string();
    }

    let mut out = String::new();
    let mut current_hidden = hidden.iter().any(|h| h == SECTIONS[0].0);
    let mut fence = Fence::default();
    for line in body.lines() {
        if let Some(title) = (!fence.contains(line))
            .then(|| heading_title(line))
            .flatten()
        {
            if let Some(key) = key_for_title(title) {
                current_hidden = hidden.iter().any(|h| h == key);
            }
        }
        if !current_hidden {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

/// Seccion canonica del cuerpo de un hallazgo, separada para que la plantilla
/// la ubique segun el orden configurado en el bloque "Hallazgos".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BodySection {
    /// Clave canonica: descripcion | impacto | poc | remediacion.
    pub key: &'static str,
    /// Titulo tal como esta escrito en el archivo (se conserva, p.ej. un
    /// "Proof of concept" legado); "Descripcion" para un preambulo suelto.
    pub title: String,
    /// true si en el archivo habia un encabezado `## ...` para la seccion. Un
    /// cuerpo sin encabezados se dibuja sin titulo, igual que antes.
    pub heading: bool,
    /// Contenido markdown sin el encabezado.
    pub content: String,
}

/// Separa el `body` en sus secciones canonicas, en orden de aparicion. El
/// preambulo antes del primer encabezado cuenta como "descripcion" (igual que
/// `parseSections` en el TS); encabezados repetidos se unen en la primera
/// aparicion; los `##` no canonicos y los que estan dentro de bloques de
/// codigo quedan como contenido de la seccion en curso.
pub fn split_sections(body: &str) -> Vec<BodySection> {
    let spans = headings(body);
    let mut out: Vec<BodySection> = Vec::new();

    let mut push = |key: &'static str, title: String, heading: bool, content: &str| {
        let content = content.trim_matches('\n').trim_end();
        if let Some(existing) = out.iter_mut().find(|s| s.key == key) {
            if !content.trim().is_empty() {
                if !existing.content.is_empty() {
                    existing.content.push_str("\n\n");
                }
                existing.content.push_str(content);
            }
            existing.heading |= heading;
        } else if heading || !content.trim().is_empty() {
            out.push(BodySection {
                key,
                title,
                heading,
                content: content.to_string(),
            });
        }
    };

    let preamble_end = spans.first().map_or(body.len(), |(offset, _)| *offset);
    push(
        SECTIONS[0].0,
        SECTIONS[0].1.to_string(),
        false,
        &body[..preamble_end],
    );
    for (i, (start, key)) in spans.iter().enumerate() {
        let end = spans.get(i + 1).map_or(body.len(), |(offset, _)| *offset);
        let chunk = &body[*start..end];
        let (line, rest) = chunk.split_once('\n').unwrap_or((chunk, ""));
        let title = heading_title(line.trim_end_matches('\r'))
            .unwrap_or_default()
            .to_string();
        push(key, title, true, rest);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const BODY: &str = "## Descripcion\n\nTexto A\n\n## Impacto\n\nTexto B\n\n## Prueba de concepto\n\nTexto C\n\n## Remediacion\n\nTexto D\n";

    #[test]
    fn aliases_accents_and_fenced_headings() {
        let body = "## Descripción\nVisible\n## Proof of concept\nSecreto\n```md\n## Remediacion\nSigue secreto\n```\n## Remédiation\nVisible final\n";
        let out = strip_hidden_sections(body, &["poc".into()]);
        assert!(out.contains("Visible final"));
        assert!(!out.contains("Secreto"));
        assert!(!out.contains("Sigue secreto"));
        assert!(!strip_hidden_sections(body, &["descripcion".into()]).contains("Visible\n"));
    }

    #[test]
    fn updates_only_target_and_preserves_fenced_examples() {
        let body = "## Descripcion\nA\n## PoC\nold\n## Remediación\nD\n";
        let content = "~~~md\n## Impacto\n~~~\n\n### Evidencia\nReal";
        let out = update_section(body, "poc", content).unwrap();
        assert_eq!(
            out,
            format!("## Descripcion\nA\n## Prueba de concepto\n\n{content}\n\n## Remediación\nD\n")
        );
        assert!(update_section(body, "poc", "## Impacto\nwrong").is_err());
        assert!(update_section(body, "poc", "```\nunclosed").is_err());
    }

    #[test]
    fn missing_preamble_and_ambiguous_sections() {
        assert!(update_section("## Descripcion\nA", "poc", "steps")
            .unwrap()
            .contains("## Prueba de concepto\n\nsteps"));
        assert_eq!(
            update_section("A\n## Impacto\nB", "descripcion", "new").unwrap(),
            "## Descripcion\n\nnew\n\n## Impacto\nB"
        );
        assert!(update_section("## PoC\nA\n## Prueba de concepto\nB", "poc", "new").is_err());
        assert!(update_section("```\nunclosed", "poc", "new").is_err());
        assert!(update_section(BODY, "unknown", "new").is_err());
    }

    #[test]
    fn missing_poc_is_inserted_before_remediation_without_rewriting_other_sections() {
        let body = "## Descripcion\nA\n## Remediation\nKeep **exactly**.\n";
        let out = update_section(body, "poc", "1. Paso\n2. Resultado").unwrap();
        assert!(out.starts_with("## Descripcion\nA\n"));
        assert!(out.ends_with("## Remediation\nKeep **exactly**.\n"));
        assert!(out.find("## Prueba de concepto").unwrap() < out.find("## Remediation").unwrap());
        let out = update_section(&out, "impacto", "Impacto confirmado").unwrap();
        assert!(out.find("## Impacto").unwrap() < out.find("## Prueba de concepto").unwrap());
        assert!(out.contains("1. Paso\n2. Resultado"));
    }

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

    #[test]
    fn split_sections_keeps_order_titles_and_fenced_headings() {
        let body = "Intro suelta\n\n## Descripcion\nA\n## Proof of concept\n```md\n## Remediacion\nno es seccion\n```\n### Paso\nC\n## Impacto\nB\n";
        let out = split_sections(body);
        let keys: Vec<_> = out.iter().map(|s| s.key).collect();
        assert_eq!(keys, vec!["descripcion", "poc", "impacto"]);
        assert_eq!(out[0].content, "Intro suelta\n\nA");
        assert!(out[0].heading);
        assert_eq!(out[1].title, "Proof of concept");
        assert!(out[1].content.contains("## Remediacion\nno es seccion"));
        assert!(out[1].content.contains("### Paso"));
        assert_eq!(out[2].content, "B");
    }

    #[test]
    fn split_sections_body_without_headings_has_no_title() {
        let out = split_sections("Solo texto libre.\n");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].key, "descripcion");
        assert!(!out[0].heading);
        assert_eq!(out[0].content, "Solo texto libre.");
        assert!(split_sections("").is_empty());
    }

    #[test]
    fn split_sections_keeps_empty_explicit_headings() {
        let out = split_sections(BODY.replace("Texto C", "").as_str());
        let poc = out.iter().find(|s| s.key == "poc").unwrap();
        assert!(poc.heading);
        assert!(poc.content.is_empty());
    }
}
