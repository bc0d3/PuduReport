// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

use super::*;
use crate::models::{ExportProfile, ExportTarget, FindingTemplate};

struct Fixture(PathBuf, String);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("pudu-continuity-{}", Uuid::new_v4()));
        workspace::create_workspace(&root, "Sintetico").unwrap();
        let (id, _) = workspace::create_project(&root, "Portal", "Demo", "pentest").unwrap();
        workspace::create_finding(&root, &id, "Acceso").unwrap();
        Self(root, id)
    }

    fn legacy(&self) {
        for (path, bytes) in source_files(&self.0, &self.1).unwrap() {
            let next = rewrite_metadata(&bytes, path.extension().unwrap() == "md", |fields| {
                fields.remove(serde_yaml::Value::String("uid".to_string()));
                set_text(fields, "future_field", "conservar".to_string());
            })
            .unwrap();
            fs::write(path, next).unwrap();
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn creation_reopen_reorder_and_edit_keep_identity() {
    let Fixture(root, id) = &Fixture::new();
    let before = snapshot(root, id).unwrap();
    let mut project = workspace::read_project_meta(root, id).unwrap();
    project.name = "Portal_v2".to_string();
    workspace::write_project_meta(root, id, &project).unwrap();
    let mut finding = before.findings[0].clone();
    finding.meta.title = "Titulo cambiado".to_string();
    finding.meta.hidden = true;
    workspace::write_finding(root, id, &finding).unwrap();
    workspace::reorder_findings(root, id, vec![finding.id.clone()]).unwrap();
    let after = snapshot(root, id).unwrap();
    assert_eq!(before.project.uid, after.project.uid);
    assert_eq!(before.findings[0].meta.uid, after.findings[0].meta.uid);
    let (_, other) = workspace::create_project(root, "Portal", "Demo", "pentest").unwrap();
    assert_ne!(other.uid, before.project.uid);
    let raw = fs::read_to_string(root.join(id).join("project.yaml")).unwrap();
    assert!(!raw.contains("revision:"));
}

#[test]
fn stale_writers_and_identity_replacement_are_rejected() {
    let fixture = Fixture::new();
    let mut first = workspace::read_project_meta(&fixture.0, &fixture.1).unwrap();
    let stale = first.clone();
    first.client = "Actualizado".to_string();
    let saved = workspace::write_project_meta(&fixture.0, &fixture.1, &first).unwrap();
    assert_eq!(saved.client, first.client);
    assert_ne!(saved.revision, first.revision);
    assert_eq!(
        saved.revision,
        workspace::read_project_meta(&fixture.0, &fixture.1)
            .unwrap()
            .revision
    );
    assert!(matches!(
        workspace::write_project_meta(&fixture.0, &fixture.1, &stale),
        Err(WorkspaceError::ConcurrentChange(_))
    ));
    let mut replacement = workspace::read_project_meta(&fixture.0, &fixture.1).unwrap();
    replacement.uid = Some(Uuid::new_v4().to_string());
    assert!(matches!(
        workspace::write_project_meta(&fixture.0, &fixture.1, &replacement),
        Err(WorkspaceError::Identity(_))
    ));
    let mut finding = workspace::list_findings(&fixture.0, &fixture.1)
        .unwrap()
        .remove(0);
    let old = finding.clone();
    finding.body.push_str("Actualizado");
    let saved = workspace::write_finding(&fixture.0, &fixture.1, &finding).unwrap();
    // El resultado refleja el Markdown persistido, incluido su salto final.
    assert_eq!(saved.body, format!("{}\n", finding.body));
    assert_ne!(saved.meta.revision, finding.meta.revision);
    assert_eq!(
        saved.meta.revision,
        workspace::load_finding(&fixture.0, &fixture.1, &finding.id)
            .unwrap()
            .meta
            .revision
    );
    assert!(matches!(
        workspace::write_finding(&fixture.0, &fixture.1, &old),
        Err(WorkspaceError::ConcurrentChange(_))
    ));
}

#[test]
fn deleted_entities_are_not_recreated_by_stale_saves() {
    let fixture = Fixture::new();
    let finding = workspace::list_findings(&fixture.0, &fixture.1)
        .unwrap()
        .remove(0);
    workspace::delete_finding(&fixture.0, &fixture.1, &finding.id).unwrap();
    assert!(matches!(
        workspace::write_finding(&fixture.0, &fixture.1, &finding),
        Err(WorkspaceError::ConcurrentChange(_))
    ));
    assert!(workspace::list_findings(&fixture.0, &fixture.1)
        .unwrap()
        .is_empty());
    let project = workspace::read_project_meta(&fixture.0, &fixture.1).unwrap();
    workspace::delete_project(&fixture.0, &fixture.1).unwrap();
    assert!(matches!(
        workspace::write_project_meta(&fixture.0, &fixture.1, &project),
        Err(WorkspaceError::ConcurrentChange(_))
    ));
    assert!(!fixture.0.join(&fixture.1).exists());
}

#[test]
fn preparation_detects_external_change_without_overwriting_it() {
    let fixture = Fixture::new();
    fixture.legacy();
    let mut changed_path = None;
    let result = prepare_locked(&fixture.0, &fixture.1, |path, previous, next| {
        let mut changed = previous.unwrap().to_vec();
        changed.extend_from_slice(b"\n# cambio externo\n");
        fs::write(path, changed).unwrap();
        changed_path = Some(path.to_path_buf());
        workspace::write_checked(path, previous, next)
    });
    assert!(matches!(result, Err(WorkspaceError::ConcurrentChange(_))));
    assert!(fs::read_to_string(changed_path.unwrap())
        .unwrap()
        .contains("# cambio externo"));
    assert_eq!(inspect(&fixture.0, &fixture.1).unwrap().missing, 2);
}

#[test]
fn failed_atomic_replace_preserves_destination_and_removes_temporary() {
    let fixture = Fixture::new();
    // Un directorio existente fuerza el fallo de rename en Windows y Unix,
    // incluso con permisos elevados, sin simular una escritura exitosa.
    let destination = fixture.0.join("protected");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("original.txt"), b"original").unwrap();
    let entries = fs::read_dir(&fixture.0).unwrap().count();
    assert!(matches!(
        workspace::write_atomic(&destination, b"replacement"),
        Err(WorkspaceError::Io(_))
    ));
    assert_eq!(
        fs::read(destination.join("original.txt")).unwrap(),
        b"original"
    );
    assert_eq!(fs::read_dir(&fixture.0).unwrap().count(), entries);
}

#[test]
fn preparation_is_explicit_repeatable_and_preserves_unknown_fields_and_body() {
    let fixture = Fixture::new();
    fixture.legacy();
    let originals = source_files(&fixture.0, &fixture.1).unwrap();
    assert_eq!(inspect(&fixture.0, &fixture.1).unwrap().missing, 2);
    assert_eq!(originals, source_files(&fixture.0, &fixture.1).unwrap());
    assert!(validate(&snapshot(&fixture.0, &fixture.1).unwrap()).is_err());
    assert_eq!(prepare(&fixture.0, &fixture.1).unwrap().missing, 0);
    let prepared = source_files(&fixture.0, &fixture.1).unwrap();
    prepare(&fixture.0, &fixture.1).unwrap();
    assert_eq!(prepared, source_files(&fixture.0, &fixture.1).unwrap());
    for (path, bytes) in prepared {
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("future_field: conservar"));
        if path.extension().unwrap() == "md" {
            let before = std::str::from_utf8(&originals[&path]).unwrap();
            assert_eq!(
                metadata_parts(before).unwrap().1,
                metadata_parts(&text).unwrap().1
            );
        }
    }
}

#[test]
fn interrupted_preparation_resumes_without_regenerating_written_identity() {
    let fixture = Fixture::new();
    fixture.legacy();
    let mut writes = 0;
    let result = prepare_locked(&fixture.0, &fixture.1, |path, previous, next| {
        writes += 1;
        if writes == 2 {
            return Err(WorkspaceError::Io(std::io::Error::other("disco simulado")));
        }
        workspace::write_checked(path, previous, next)
    });
    assert!(result.is_err());
    let written = workspace::read_project_meta(&fixture.0, &fixture.1)
        .unwrap()
        .uid;
    assert!(written.is_some());
    prepare(&fixture.0, &fixture.1).unwrap();
    assert_eq!(
        written,
        workspace::read_project_meta(&fixture.0, &fixture.1)
            .unwrap()
            .uid
    );
    assert_eq!(inspect(&fixture.0, &fixture.1).unwrap().missing, 0);
}

#[test]
fn invalid_or_duplicate_ids_block_preparation_before_writes_including_hidden() {
    let fixture = Fixture::new();
    let first = workspace::list_findings(&fixture.0, &fixture.1)
        .unwrap()
        .remove(0);
    let mut second = workspace::create_finding(&fixture.0, &fixture.1, "Otro").unwrap();
    second.meta.hidden = true;
    workspace::write_finding(&fixture.0, &fixture.1, &second).unwrap();
    let path = fixture
        .0
        .join(&fixture.1)
        .join("findings")
        .join(format!("{}.md", second.id));
    let bytes = fs::read(&path).unwrap();
    for invalid in [
        first.meta.uid.unwrap(),
        "invalido".to_string(),
        String::new(),
    ] {
        let changed =
            rewrite_metadata(&bytes, true, |fields| set_text(fields, "uid", invalid)).unwrap();
        fs::write(&path, changed).unwrap();
        let originals = source_files(&fixture.0, &fixture.1).unwrap();
        assert!(prepare(&fixture.0, &fixture.1).is_err());
        assert_eq!(originals, source_files(&fixture.0, &fixture.1).unwrap());
        assert!(validate(&snapshot(&fixture.0, &fixture.1).unwrap()).is_err());
    }
}

#[test]
fn duplicate_and_template_create_new_ids_and_preserve_references() {
    let fixture = Fixture::new();
    let first = workspace::list_findings(&fixture.0, &fixture.1)
        .unwrap()
        .remove(0);
    let duplicate = workspace::duplicate_finding(&fixture.0, &fixture.1, &first.id).unwrap();
    assert_ne!(duplicate.meta.uid, first.meta.uid);
    assert_eq!(duplicate.body, first.body);
    let template = FindingTemplate {
        id: "plantilla".to_string(),
        meta: first.meta.clone(),
        body: first.body,
        builtin: false,
    };
    workspace::save_finding_template(&fixture.0, &template).unwrap();
    assert!(workspace::list_finding_templates(&fixture.0).unwrap()[0]
        .meta
        .uid
        .is_none());
    let instance = workspace::instantiate_template(
        &fixture.0,
        &fixture.1,
        "plantilla",
        &Default::default(),
        None,
    )
    .unwrap();
    assert_ne!(instance.meta.uid, first.meta.uid);
    assert_ne!(instance.meta.uid, duplicate.meta.uid);
    validate(&snapshot(&fixture.0, &fixture.1).unwrap()).unwrap();
}

#[test]
fn copy_continue_and_independent_keep_source_assets_and_local_references() {
    let fixture = Fixture::new();
    let finding = workspace::list_findings(&fixture.0, &fixture.1)
        .unwrap()
        .remove(0);
    let mut meta = workspace::read_project_meta(&fixture.0, &fixture.1).unwrap();
    meta.external_reference = Some("PENTEST-042".to_string());
    meta.plan_remediacion
        .push(crate::models::AccionRemediacion {
            hallazgos: vec![finding.id.clone()],
            ..Default::default()
        });
    workspace::write_project_meta(&fixture.0, &fixture.1, &meta).unwrap();
    fs::write(
        fixture.0.join(&fixture.1).join("assets/demo.txt"),
        "sintetico",
    )
    .unwrap();
    fs::write(fixture.0.join(&fixture.1).join("assets/.hidden"), "oculto").unwrap();
    let original = source_files(&fixture.0, &fixture.1).unwrap();
    let (continued, _) = copy_project(
        &fixture.0,
        &fixture.1,
        "Portal copia",
        CopyMode::Continue,
        Some("PENTEST-042"),
    )
    .unwrap();
    let (independent, _) = copy_project(
        &fixture.0,
        &fixture.1,
        "Portal copia",
        CopyMode::Independent,
        None,
    )
    .unwrap();
    let continued = snapshot(&fixture.0, &continued).unwrap();
    let separate = snapshot(&fixture.0, &independent).unwrap();
    assert_eq!(continued.project.uid, meta.uid);
    assert_eq!(continued.findings[0].meta.uid, finding.meta.uid);
    assert_ne!(separate.project.uid, meta.uid);
    assert_ne!(separate.findings[0].meta.uid, finding.meta.uid);
    assert!(separate.project.external_reference.is_none());
    assert_eq!(
        separate.project.plan_remediacion[0].hallazgos,
        vec![finding.id]
    );
    assert_eq!(
        fs::read_to_string(fixture.0.join(&independent).join("assets/demo.txt")).unwrap(),
        "sintetico"
    );
    assert_eq!(
        fs::read_to_string(fixture.0.join(independent).join("assets/.hidden")).unwrap(),
        "oculto"
    );
    assert_eq!(original, source_files(&fixture.0, &fixture.1).unwrap());
}

#[test]
fn profiles_and_optional_text_distinguish_absence_invalid_and_unicode() {
    let target: ExportTarget =
        serde_json::from_str(r#"{"name":"demo","url":"https://example.invalid"}"#).unwrap();
    assert_eq!(target.profile, ExportProfile::Legacy);
    assert!(serde_json::from_str::<ExportTarget>(
        r#"{"name":"demo","url":"https://example.invalid","profile":"v99"}"#
    )
    .is_err());
    assert!(serde_yaml::from_str::<ProjectMeta>("uid: null").is_err());
    assert!(serde_yaml::from_str::<ProjectMeta>("uid: 123").is_err());
    assert!(ProjectMeta::default().uid.is_none());
    assert_eq!(
        external_reference(Some(&"ñ".repeat(128)))
            .unwrap()
            .unwrap()
            .chars()
            .count(),
        128
    );
    assert!(external_reference(Some(&"ñ".repeat(129))).is_err());
    assert!(external_reference(Some("  ")).is_err());
}

#[test]
fn child_lock_probe() {
    let Some(root) = std::env::var_os("PUDU_LOCK_TEST_ROOT") else {
        return;
    };
    let result = WorkspaceLock::acquire(Path::new(&root));
    if std::env::var_os("PUDU_LOCK_EXPECT_BUSY").is_some() {
        assert!(matches!(result, Err(WorkspaceError::Busy)));
    } else {
        assert!(result.is_ok());
    }
}

#[test]
fn lock_coordinates_processes_and_releases_on_drop() {
    let fixture = Fixture::new();
    let lock = WorkspaceLock::acquire(&fixture.0).unwrap();
    let mut child = std::process::Command::new(std::env::current_exe().unwrap());
    child
        .args(["--exact", "continuity::tests::child_lock_probe"])
        .env("PUDU_LOCK_TEST_ROOT", &fixture.0);
    assert!(child
        .env("PUDU_LOCK_EXPECT_BUSY", "1")
        .status()
        .unwrap()
        .success());
    drop(lock);
    assert!(child
        .env_remove("PUDU_LOCK_EXPECT_BUSY")
        .status()
        .unwrap()
        .success());
}
