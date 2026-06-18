//! Indice SQLite para busqueda y filtros.
//!
//! NUNCA es fuente de verdad: se reconstruye por completo desde los archivos
//! del workspace. Si se borra, se regenera. Vive en `<root>/.pudu/index.db`.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use pudureport_core::workspace;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("error de SQLite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("error de workspace: {0}")]
    Workspace(#[from] workspace::WorkspaceError),
    #[error("error de entrada/salida: {0}")]
    Io(#[from] std::io::Error),
}

type Result<T> = std::result::Result<T, DbError>;

/// Resultado de busqueda en el indice.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchHit {
    pub project_id: String,
    pub finding_id: String,
    pub title: String,
    pub severity: String,
}

fn db_path(root: &Path) -> PathBuf {
    root.join(".pudu/index.db")
}

fn open(root: &Path) -> Result<Connection> {
    let path = db_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS findings (
            project_id TEXT NOT NULL,
            finding_id TEXT NOT NULL,
            title      TEXT NOT NULL,
            severity   TEXT NOT NULL,
            cwe        TEXT,
            body       TEXT,
            PRIMARY KEY (project_id, finding_id)
        );",
    )?;
    Ok(conn)
}

/// Reconstruye el indice completo desde los archivos del workspace.
pub fn reindex(root: &Path) -> Result<()> {
    let mut conn = open(root)?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM findings", [])?;

    for project in workspace::list_projects(root)? {
        for finding in workspace::list_findings(root, &project.id)? {
            let severity = serde_json::to_string(&finding.meta.severity)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string();
            tx.execute(
                "INSERT OR REPLACE INTO findings
                    (project_id, finding_id, title, severity, cwe, body)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    project.id,
                    finding.id,
                    finding.meta.title,
                    severity,
                    finding.meta.cwe,
                    finding.body,
                ],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Busca hallazgos por coincidencia en titulo o cuerpo.
pub fn search(root: &Path, query: &str) -> Result<Vec<SearchHit>> {
    let conn = open(root)?;
    let like = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT project_id, finding_id, title, severity
         FROM findings
         WHERE title LIKE ?1 OR body LIKE ?1
         ORDER BY title COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([&like], |row| {
        Ok(SearchHit {
            project_id: row.get(0)?,
            finding_id: row.get(1)?,
            title: row.get(2)?,
            severity: row.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reindex_and_search() {
        let tmp = std::env::temp_dir().join(format!("pudu-db-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        workspace::create_workspace(&tmp, "WS").unwrap();
        let (pid, _) = workspace::create_project(&tmp, "Web", "ACME", "pentest").unwrap();
        workspace::create_finding(&tmp, &pid, "SQL Injection en login").unwrap();

        reindex(&tmp).unwrap();
        let hits = search(&tmp, "injection").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "SQL Injection en login");

        let none = search(&tmp, "xxxxxx").unwrap();
        assert!(none.is_empty());

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
