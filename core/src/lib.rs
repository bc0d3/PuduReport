//! Logica compartida de PuduReport, sin dependencias de Tauri.
//!
//! La usan la app de escritorio (src-tauri) y, mas adelante, el servidor MCP.
//! Regla de oro: los archivos en disco son la fuente de verdad.

// cvss4_lookup.rs se incluye con include! dentro de cvss.rs (no es un modulo).
pub mod cvss;
pub mod markdown;
pub mod models;
pub mod workspace;
