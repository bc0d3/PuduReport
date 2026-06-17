//! Conversor de markdown a markup de Typst.
//!
//! README.dev.md prefiere el paquete `cmarker` dentro del template, con fallback a
//! convertir en Rust con pulldown-cmark. Elegimos el fallback para garantizar
//! operacion 100% offline (sin descargar paquetes del registro de Typst), algo
//! clave para trabajo bajo NDA.
//!
//! La salida es markup de Typst que el template renderiza con
//! `eval(body, mode: "markup")`.

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Parser, Tag, TagEnd};

/// Convierte markdown a una cadena de markup de Typst.
pub fn to_typst(markdown: &str) -> String {
    let parser = Parser::new(markdown);
    let mut out = String::new();
    let mut list_stack: Vec<Option<u64>> = Vec::new();
    // Dentro de un bloque de codigo (raw) el texto va literal, sin escapar.
    let mut in_code_block = false;
    // Para imagenes: capturamos url + alt (que puede llevar el ancho, ej "60%")
    // y emitimos #image(..) al cerrar.
    let mut image_url: Option<String> = None;
    let mut image_alt = String::new();

    for event in parser {
        match event {
            Event::Start(Tag::Image { dest_url, .. }) => {
                image_url = Some(dest_url.to_string());
                image_alt.clear();
            }
            Event::Start(tag) => {
                if matches!(tag, Tag::CodeBlock(_)) {
                    in_code_block = true;
                }
                start_tag(&mut out, &mut list_stack, tag);
            }
            Event::End(TagEnd::Image) => {
                if let Some(url) = image_url.take() {
                    out.push_str(&image_typst(&url, &image_alt));
                }
            }
            Event::End(tag) => {
                if matches!(tag, TagEnd::CodeBlock) {
                    in_code_block = false;
                }
                end_tag(&mut out, &mut list_stack, tag);
            }
            Event::Text(text) => {
                if image_url.is_some() {
                    // Texto dentro de una imagen: es el alt (lleva el ancho).
                    image_alt.push_str(&text);
                } else if in_code_block {
                    out.push_str(&text);
                } else {
                    out.push_str(&escape(&text));
                }
            }
            Event::Code(code) => {
                out.push('`');
                out.push_str(&code.replace('`', "\u{2018}"));
                out.push('`');
            }
            Event::SoftBreak => out.push(' '),
            Event::HardBreak => out.push_str(" \\\n"),
            Event::Rule => out.push_str("\n#line(length: 100%)\n\n"),
            // HTML embebido se ignora para evitar inyectar markup arbitrario.
            Event::Html(_) | Event::InlineHtml(_) => {}
            _ => {}
        }
    }
    out.trim().to_string()
}

fn start_tag(out: &mut String, list_stack: &mut Vec<Option<u64>>, tag: Tag) {
    match tag {
        Tag::Heading { level, .. } => {
            let depth = heading_depth(level);
            out.push_str(&"=".repeat(depth));
            out.push(' ');
        }
        Tag::Paragraph => {}
        Tag::Strong => out.push('*'),
        Tag::Emphasis => out.push('_'),
        Tag::List(start) => list_stack.push(start),
        Tag::Item => {
            let indent = "  ".repeat(list_stack.len().saturating_sub(1));
            out.push_str(&indent);
            match list_stack.last_mut() {
                Some(Some(n)) => {
                    out.push_str(&format!("{n}. "));
                    *n += 1;
                }
                _ => out.push_str("- "),
            }
        }
        Tag::CodeBlock(kind) => {
            let lang = match kind {
                CodeBlockKind::Fenced(l) => l.to_string(),
                CodeBlockKind::Indented => String::new(),
            };
            out.push_str("```");
            out.push_str(&lang);
            out.push('\n');
        }
        Tag::Link { dest_url, .. } => {
            out.push_str(&format!("#link(\"{}\")[", escape_string(&dest_url)));
        }
        // Las imagenes se manejan en el bucle principal (necesitan el alt/ancho).
        Tag::BlockQuote(_) => out.push_str("#quote(block: true)[\n"),
        _ => {}
    }
}

fn end_tag(out: &mut String, list_stack: &mut Vec<Option<u64>>, tag: TagEnd) {
    match tag {
        TagEnd::Heading(_) => out.push_str("\n\n"),
        TagEnd::Paragraph => out.push_str("\n\n"),
        TagEnd::Strong => out.push('*'),
        TagEnd::Emphasis => out.push('_'),
        TagEnd::List(_) => {
            list_stack.pop();
            out.push('\n');
        }
        TagEnd::Item => out.push('\n'),
        TagEnd::CodeBlock => out.push_str("```\n\n"),
        TagEnd::Link => out.push(']'),
        TagEnd::BlockQuote(_) => out.push_str("\n]\n\n"),
        _ => {}
    }
}

fn heading_depth(level: HeadingLevel) -> usize {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

/// Escapa caracteres con significado especial en markup de Typst.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '\\' | '#' | '$' | '*' | '_' | '`' | '<' | '>' | '@' | '[' | ']' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}

/// Escapa una cadena para usar dentro de comillas dobles de Typst.
fn escape_string(text: &str) -> String {
    text.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Construye la llamada #image, aplicando el ancho si el alt lo indica.
fn image_typst(url: &str, alt: &str) -> String {
    match parse_width(alt) {
        Some(width) => format!("#image(\"{}\", width: {})", escape_string(url), width),
        None => format!("#image(\"{}\")", escape_string(url)),
    }
}

/// Interpreta el alt como un ancho ("60%" o "60") y devuelve el ancho Typst.
fn parse_width(alt: &str) -> Option<String> {
    let trimmed = alt.trim();
    let digits = trimmed.strip_suffix('%').unwrap_or(trimmed);
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let pct: u32 = digits.parse().ok()?;
    if (1..=100).contains(&pct) {
        Some(format!("{pct}%"))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heading_and_paragraph() {
        let out = to_typst("## Descripcion\n\nUn texto.");
        assert!(out.contains("== Descripcion"));
        assert!(out.contains("Un texto."));
    }

    #[test]
    fn emphasis_and_strong() {
        let out = to_typst("Esto es **fuerte** y *enfasis*.");
        assert!(out.contains("*fuerte*"));
        assert!(out.contains("_enfasis_"));
    }

    #[test]
    fn code_block() {
        let out = to_typst("```sql\nSELECT 1\n```");
        assert!(out.contains("```sql"));
        assert!(out.contains("SELECT 1"));
    }

    #[test]
    fn code_block_content_is_not_escaped() {
        // Dentro de un bloque raw los caracteres especiales van literales.
        let out = to_typst("```\npassword: cualquier_cosa <token>\n```");
        assert!(out.contains("cualquier_cosa <token>"));
        assert!(!out.contains("cualquier\\_cosa"));
    }

    #[test]
    fn escapes_special_chars() {
        // Un # crudo no debe romper el markup de Typst.
        let out = to_typst("precio #1 con $5");
        assert!(out.contains("\\#1"));
        assert!(out.contains("\\$5"));
    }

    #[test]
    fn link_conversion() {
        let out = to_typst("[ACME](https://acme.com)");
        assert!(out.contains("#link(\"https://acme.com\")[ACME]"));
    }

    #[test]
    fn image_conversion() {
        // El alt no debe quedar como texto suelto despues de la imagen.
        let out = to_typst("![captura de evidencia](assets/ab12.png)");
        assert!(out.contains("#image(\"assets/ab12.png\")"));
        assert!(!out.contains("captura de evidencia"));
        assert!(!out.contains("width:"));
    }

    #[test]
    fn image_width_from_alt() {
        let out = to_typst("![60%](assets/ab12.png)");
        assert!(out.contains("#image(\"assets/ab12.png\", width: 60%)"));

        // Sin sufijo % tambien se interpreta como porcentaje.
        let out2 = to_typst("![35](assets/x.png)");
        assert!(out2.contains("width: 35%"));

        // Valor fuera de rango se ignora.
        let out3 = to_typst("![999](assets/x.png)");
        assert!(!out3.contains("width:"));
    }
}
