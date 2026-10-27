// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

//! Identidades de documentos y hallazgos; preparacion explicita y copias locales.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{ExportTarget, Finding, ProjectMeta};
use crate::storage::WorkspaceLock;
use crate::workspace::{self, WorkspaceError};

type Result<T> = std::result::Result<T, WorkspaceError>;

/// Fotografia de los originales usados para una exportacion. No contiene assets.
pub struct ProjectSnapshot {
    pub project: ProjectMeta,
    pub findings: Vec<Finding>,
    files: BTreeMap<PathBuf, Vec<u8>>,
}

fn source_files(root: &Path, project_id: &str) -> Result<BTreeMap<PathBuf, Vec<u8>>> {
    workspace::validate_id(project_id)?;
    let dir = root.join(project_id);
    let mut paths = vec![dir.join("project.yaml")];
    for id in workspace::finding_ids(root, project_id)? {
        workspace::validate_id(&id)?;
        paths.push(dir.join("findings").join(format!("{id}.md")));
    }
    paths
        .into_iter()
        .map(|path| {
            let bytes = fs::read(&path)?;
            Ok((path, bytes))
        })
        .collect()
}

impl ProjectSnapshot {
    /// Igualdad de los originales, usada al confirmar una exportacion preparada.
    pub fn same_sources(&self, other: &Self) -> bool {
        self.files == other.files
    }

    /// Detecta archivos cambiados, agregados o eliminados desde la lectura.
    pub fn verify_current(&self, root: &Path, project_id: &str) -> Result<()> {
        if source_files(root, project_id)? != self.files {
            return Err(WorkspaceError::ConcurrentChange(project_id.to_string()));
        }
        Ok(())
    }
}

/// Lee sin generar identidades ni escribir archivos. Rechaza una lectura incoherente.
pub fn snapshot(root: &Path, project_id: &str) -> Result<ProjectSnapshot> {
    let files = source_files(root, project_id)?;
    let result = ProjectSnapshot {
        project: workspace::read_project_meta(root, project_id)?,
        findings: workspace::list_findings(root, project_id)?,
        files,
    };
    result.verify_current(root, project_id)?;
    Ok(result)
}

/// Lee proyecto y destino bajo el mismo bloqueo que usan los escritores app/MCP.
pub fn export_source(
    root: &Path,
    project_id: &str,
    target_name: &str,
) -> Result<(ProjectSnapshot, ExportTarget)> {
    let _lock = WorkspaceLock::acquire(root)?;
    let target = workspace::read_workspace_meta(root)?
        .export_targets
        .into_iter()
        .find(|target| target.name == target_name)
        .ok_or_else(|| WorkspaceError::InvalidName("destino inexistente".to_string()))?;
    Ok((snapshot(root, project_id)?, target))
}

/// Referencia opcional normalizada, medida en caracteres Unicode; nunca se trunca.
pub fn external_reference(value: Option<&str>) -> Result<Option<String>> {
    match value {
        None => Ok(None),
        Some(value) if !value.trim().is_empty() && value.trim().chars().count() <= 128 => {
            Ok(Some(value.trim().to_string()))
        }
        Some(_) => Err(WorkspaceError::InvalidReference),
    }
}

/// Valida un UUID sin generarlo ni repararlo. No depende de nombres o carpetas.
pub fn parse_uid(value: Option<&str>, entity: &str) -> Result<Uuid> {
    value
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or_else(|| WorkspaceError::Identity(format!("UUID ausente o invalido en {entity}")))
}

/// Inventario previo a la preparacion; incluye hallazgos ocultos.
#[derive(Debug, Serialize)]
pub struct IdentityStatus {
    pub project_uid: Option<String>,
    pub findings: usize,
    pub missing: usize,
    pub conflicts: Vec<String>,
}

fn inventory(data: &ProjectSnapshot) -> IdentityStatus {
    let mut result = IdentityStatus {
        project_uid: data.project.uid.clone(),
        findings: data.findings.len(),
        missing: usize::from(data.project.uid.is_none()),
        conflicts: Vec::new(),
    };
    if let Some(uid) = data.project.uid.as_deref() {
        if Uuid::parse_str(uid).is_err() {
            result
                .conflicts
                .push("UUID invalido en project.yaml".to_string());
        }
    }
    let mut seen = HashSet::new();
    for finding in &data.findings {
        match finding.meta.uid.as_deref() {
            None => result.missing += 1,
            Some(uid) => match Uuid::parse_str(uid) {
                Ok(uid) if seen.insert(uid) => {}
                Ok(_) => result
                    .conflicts
                    .push(format!("UUID repetido en {}", finding.id)),
                Err(_) => result
                    .conflicts
                    .push(format!("UUID invalido en {}", finding.id)),
            },
        }
    }
    result
}

/// Comprueba identidad completa y sin duplicados antes de exportar v2 o continuar.
pub fn validate(data: &ProjectSnapshot) -> Result<()> {
    let status = inventory(data);
    reject_conflicts(&status)?;
    if status.missing != 0 {
        return Err(WorkspaceError::Identity(format!(
            "faltan {} UUID; usa Preparar identidades antes de exportar v2",
            status.missing
        )));
    }
    external_reference(data.project.external_reference.as_deref())?;
    Ok(())
}

fn reject_conflicts(status: &IdentityStatus) -> Result<()> {
    if status.conflicts.is_empty() {
        Ok(())
    } else {
        Err(WorkspaceError::Identity(status.conflicts.join("; ")))
    }
}

/// Inspeccion de solo lectura, apta para presentar el alcance antes de preparar.
pub fn inspect(root: &Path, project_id: &str) -> Result<IdentityStatus> {
    Ok(inventory(&snapshot(root, project_id)?))
}

fn metadata_parts(content: &str) -> Result<(&str, &str)> {
    let trimmed = content.trim_start_matches('\u{feff}').trim_start();
    let rest = trimmed
        .strip_prefix("---")
        .ok_or_else(|| WorkspaceError::NoFrontMatter("hallazgo".to_string()))?
        .trim_start_matches(['\r', '\n']);
    let end = rest
        .find("\n---")
        .ok_or_else(|| WorkspaceError::NoFrontMatter("hallazgo".to_string()))?;
    Ok((&rest[..end], &rest[end + 4..]))
}

fn rewrite_metadata(
    bytes: &[u8],
    finding: bool,
    update: impl FnOnce(&mut serde_yaml::Mapping),
) -> Result<Vec<u8>> {
    let content = std::str::from_utf8(bytes).map_err(|error| {
        WorkspaceError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, error))
    })?;
    let (yaml, tail) = if finding {
        metadata_parts(content)?
    } else {
        (content, "")
    };
    let mut fields: serde_yaml::Mapping = serde_yaml::from_str(yaml)?;
    update(&mut fields);
    let yaml = serde_yaml::to_string(&fields)?;
    // El cuerpo se conserva byte por byte, incluidos espacios y saltos finales.
    Ok(if finding {
        format!("---\n{yaml}---{tail}").into_bytes()
    } else {
        yaml.into_bytes()
    })
}

fn set_text(fields: &mut serde_yaml::Mapping, key: &str, value: String) {
    fields.insert(
        serde_yaml::Value::String(key.to_string()),
        serde_yaml::Value::String(value),
    );
}

/// Completa solo UUID ausentes. El bloqueo coordina app/MCP; un fallo parcial es reanudable.
pub fn prepare(root: &Path, project_id: &str) -> Result<IdentityStatus> {
    let _lock = WorkspaceLock::acquire(root)?;
    prepare_locked(root, project_id, workspace::write_checked)
}

fn prepare_locked(
    root: &Path,
    project_id: &str,
    mut write: impl FnMut(&Path, Option<&[u8]>, &[u8]) -> Result<()>,
) -> Result<IdentityStatus> {
    let mut data = snapshot(root, project_id)?;
    reject_conflicts(&inventory(&data))?;
    let mut pending = Vec::new();
    if data.project.uid.is_none() {
        pending.push(root.join(project_id).join("project.yaml"));
    }
    for finding in &data.findings {
        if finding.meta.uid.is_none() {
            pending.push(
                root.join(project_id)
                    .join("findings")
                    .join(format!("{}.md", finding.id)),
            );
        }
    }
    for path in pending {
        data.verify_current(root, project_id)?;
        let original = data
            .files
            .get(&path)
            .ok_or_else(|| WorkspaceError::ConcurrentChange(project_id.to_string()))?;
        let next = rewrite_metadata(
            original,
            path.extension().is_some_and(|ext| ext == "md"),
            |fields| {
                set_text(fields, "uid", Uuid::new_v4().to_string());
            },
        )?;
        write(&path, Some(original), &next)?;
        data.files.insert(path, next);
    }
    inspect(root, project_id)
}

/// Semantica de una copia nueva; nunca cambia las identidades del origen.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CopyMode {
    Continue,
    Independent,
}

struct Staging(PathBuf);
impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn copy_tree(source: &Path, destination: &Path, project_root: bool) -> Result<()> {
    fs::create_dir(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if project_root && (name == "build" || name == ".pudu" || name == ".git") {
            continue;
        }
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            return Err(WorkspaceError::InvalidName(
                "la copia no admite enlaces simbolicos".to_string(),
            ));
        }
        if kind.is_dir() {
            copy_tree(&entry.path(), &destination.join(&name), false)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), destination.join(&name))?;
        }
    }
    Ok(())
}

/// Crea una carpeta nueva por staging; conserva slugs/referencias internas y copia assets.
/// Continuar exige identidad completa; independiente genera identidades nuevas.
pub fn copy_project(
    root: &Path,
    project_id: &str,
    name: &str,
    mode: CopyMode,
    reference: Option<&str>,
) -> Result<(String, ProjectMeta)> {
    workspace::validate_id(project_id)?;
    if name.trim().is_empty() {
        return Err(WorkspaceError::InvalidName(
            "nombre de proyecto vacio".to_string(),
        ));
    }
    let reference = external_reference(reference)?;
    let _lock = WorkspaceLock::acquire(root)?;
    let data = snapshot(root, project_id)?;
    reject_conflicts(&inventory(&data))?;
    if matches!(mode, CopyMode::Continue) {
        validate(&data)?;
    }
    let stage = Staging(root.join(".pudu").join(format!("copy-{}", Uuid::new_v4())));
    copy_tree(&root.join(project_id), &stage.0, true)?;
    for (path, original) in &data.files {
        let relative = path
            .strip_prefix(root.join(project_id))
            .map_err(|_| WorkspaceError::InvalidName(project_id.to_string()))?;
        let finding = path.extension().is_some_and(|ext| ext == "md");
        let next = rewrite_metadata(original, finding, |fields| {
            if matches!(mode, CopyMode::Independent) {
                set_text(fields, "uid", Uuid::new_v4().to_string());
            }
            if !finding {
                set_text(fields, "name", name.trim().to_string());
                fields.remove(serde_yaml::Value::String("external_reference".to_string()));
                if let Some(reference) = &reference {
                    set_text(fields, "external_reference", reference.clone());
                }
            }
        })?;
        workspace::write_atomic(&stage.0.join(relative), &next)?;
    }
    data.verify_current(root, project_id)?;
    let base = crate::models::slug_key(name);
    let base = if base.is_empty() { "proyecto" } else { &base };
    let mut id = base.to_string();
    let mut number = 2;
    while root.join(&id).exists() {
        id = format!("{base}-{number}");
        number += 1;
    }
    fs::rename(&stage.0, root.join(&id))?;
    let project = workspace::read_project_meta(root, &id)?;
    Ok((id, project))
}

#[cfg(test)]
mod tests;
