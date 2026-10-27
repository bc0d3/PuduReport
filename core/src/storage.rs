// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Coordinacion de escritores cooperativos y revisiones optimistas de archivos.

use std::fs::{self, File, OpenOptions};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::workspace::WorkspaceError;

/// El SO libera el bloqueo al cerrar el descriptor, incluso si termina el proceso.
/// Nunca borrar/reemplazar el archivo de bloqueo mientras haya procesos abiertos.
pub(crate) struct WorkspaceLock {
    _file: File,
}

impl WorkspaceLock {
    pub(crate) fn acquire(root: &Path) -> Result<Self, WorkspaceError> {
        let dir = root.join(".pudu");
        fs::create_dir_all(&dir)?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(dir.join("write.lock"))?;
        fs2::FileExt::try_lock_exclusive(&file).map_err(|error| {
            if error.kind() == fs2::lock_contended_error().kind() {
                WorkspaceError::Busy
            } else {
                WorkspaceError::Io(error)
            }
        })?;
        Ok(Self { _file: file })
    }
}

pub(crate) fn revision(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(crate) fn check_revision(
    bytes: &[u8],
    expected: Option<&str>,
    entity: &str,
) -> Result<(), WorkspaceError> {
    if expected != Some(revision(bytes).as_str()) {
        return Err(WorkspaceError::ConcurrentChange(entity.to_string()));
    }
    Ok(())
}
