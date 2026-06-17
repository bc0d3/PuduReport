//! Operaciones git sobre el workspace del usuario (no sobre el repo del codigo).
//!
//! Solo init y commit: el workspace es git-friendly (texto + assets) y el
//! usuario decide cuando versionar sus reportes.

use std::path::Path;

use git2::{IndexAddOption, Repository, Signature};

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("error de git: {0}")]
    Git(#[from] git2::Error),
}

type Result<T> = std::result::Result<T, GitError>;

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
}
