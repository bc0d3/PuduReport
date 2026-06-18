//! Operaciones git sobre el workspace del usuario (no sobre el repo del codigo).
//!
//! Solo init y commit: el workspace es git-friendly (texto + assets) y el
//! usuario decide cuando versionar sus reportes.

use std::path::Path;

use git2::{Commit, IndexAddOption, Repository, Signature, Sort, StatusOptions};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("error de git: {0}")]
    Git(#[from] git2::Error),
}

type Result<T> = std::result::Result<T, GitError>;

/// Un archivo con cambios sin commitear, relativo al workspace.
#[derive(Serialize)]
pub struct GitChange {
    pub path: String,
    /// "new" | "modified" | "deleted" | "renamed".
    pub status: String,
}

/// Estado git del proyecto: si hay repo y los cambios pendientes.
#[derive(Serialize)]
pub struct GitState {
    pub initialized: bool,
    pub changes: Vec<GitChange>,
}

/// Un commit del historial.
#[derive(Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    /// Segundos Unix.
    pub timestamp: i64,
}

/// Cambios sin commitear que tocan la carpeta del proyecto. Si no hay repo,
/// devuelve initialized=false (la UI ofrece inicializar).
pub fn status(root: &Path, project_id: &str) -> Result<GitState> {
    let repo = match Repository::open(root) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitState {
                initialized: false,
                changes: Vec::new(),
            });
        }
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts))?;

    let prefix = format!("{project_id}/");
    let mut changes = Vec::new();
    for entry in statuses.iter() {
        let Some(path) = entry.path() else { continue };
        if !path.starts_with(&prefix) {
            continue;
        }
        let s = entry.status();
        let label = if s.is_wt_new() || s.is_index_new() {
            "new"
        } else if s.is_wt_deleted() || s.is_index_deleted() {
            "deleted"
        } else if s.is_wt_renamed() || s.is_index_renamed() {
            "renamed"
        } else {
            "modified"
        };
        changes.push(GitChange {
            path: path.to_string(),
            status: label.to_string(),
        });
    }
    changes.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(GitState {
        initialized: true,
        changes,
    })
}

/// True si el commit modifica algun archivo bajo `prefix`.
fn commit_touches(repo: &Repository, commit: &Commit, prefix: &str) -> Result<bool> {
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;
    let mut touched = false;
    diff.foreach(
        &mut |delta, _| {
            let file = delta.new_file().path().or_else(|| delta.old_file().path());
            if let Some(p) = file {
                if p.to_string_lossy().starts_with(prefix) {
                    touched = true;
                }
            }
            true
        },
        None,
        None,
        None,
    )?;
    Ok(touched)
}

/// Historial de commits que tocan la carpeta del proyecto (mas reciente primero).
pub fn log(root: &Path, project_id: &str, limit: usize) -> Result<Vec<GitCommit>> {
    let repo = match Repository::open(root) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };
    if repo.head().is_err() {
        // Repo sin commits todavia.
        return Ok(Vec::new());
    }

    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    walk.set_sorting(Sort::TIME)?;

    let prefix = format!("{project_id}/");
    let mut out = Vec::new();
    for oid in walk {
        if out.len() >= limit {
            break;
        }
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        if !commit_touches(&repo, &commit, &prefix)? {
            continue;
        }
        out.push(GitCommit {
            hash: oid.to_string().chars().take(7).collect(),
            message: commit.summary().unwrap_or("(sin mensaje)").to_string(),
            author: commit.author().name().unwrap_or("?").to_string(),
            timestamp: commit.time().seconds(),
        });
    }
    Ok(out)
}

/// Inicializa un repositorio git en el workspace si no existe.
pub fn init(root: &Path) -> Result<()> {
    if Repository::open(root).is_ok() {
        return Ok(());
    }
    Repository::init(root)?;
    Ok(())
}

/// Crea un commit con todos los cambios del workspace.
pub fn commit(root: &Path, message: &str) -> Result<()> {
    let repo = Repository::open(root)?;

    let mut index = repo.index()?;
    index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    let signature = signature(&repo)?;
    let parent = repo.head().ok().and_then(|h| h.target());

    match parent {
        Some(oid) => {
            let parent_commit = repo.find_commit(oid)?;
            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &[&parent_commit],
            )?;
        }
        None => {
            repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &[])?;
        }
    }
    Ok(())
}

/// Firma del commit: usa la config local de git, con un fallback razonable.
fn signature(repo: &Repository) -> Result<Signature<'static>> {
    if let Ok(sig) = repo.signature() {
        return Ok(sig);
    }
    Ok(Signature::now("PuduReport", "pudureport@localhost")?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_and_commit() {
        let tmp = std::env::temp_dir().join(format!("pudu-git-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("a.txt"), "hola").unwrap();

        init(&tmp).unwrap();
        assert!(tmp.join(".git").exists());
        commit(&tmp, "commit inicial").unwrap();

        let repo = Repository::open(&tmp).unwrap();
        assert!(repo.head().is_ok());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn status_and_log_scoped_to_project() {
        let tmp = std::env::temp_dir().join(format!("pudu-gitlog-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("proj-a/findings")).unwrap();
        std::fs::create_dir_all(tmp.join("proj-b")).unwrap();

        // Sin repo: initialized=false.
        assert!(!status(&tmp, "proj-a").unwrap().initialized);

        init(&tmp).unwrap();
        std::fs::write(tmp.join("proj-a/findings/001.md"), "uno").unwrap();
        std::fs::write(tmp.join("proj-b/project.yaml"), "x").unwrap();
        commit(&tmp, "primer commit de proj-a y proj-b").unwrap();

        // Cambio nuevo en proj-a, nada en proj-b.
        std::fs::write(tmp.join("proj-a/findings/002.md"), "dos").unwrap();
        let st = status(&tmp, "proj-a").unwrap();
        assert!(st.initialized);
        assert_eq!(st.changes.len(), 1);
        assert_eq!(st.changes[0].status, "new");
        assert!(status(&tmp, "proj-b").unwrap().changes.is_empty());

        // El log de proj-a incluye el commit (toca proj-a).
        let log_a = log(&tmp, "proj-a", 50).unwrap();
        assert_eq!(log_a.len(), 1);
        assert!(log_a[0].message.contains("primer commit"));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
