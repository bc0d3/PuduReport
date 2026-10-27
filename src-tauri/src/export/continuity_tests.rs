// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

use super::*;
use std::fs;

const PROJECT: &str = "portal-demo";
const AT: &str = "2026-10-26T15:00:00Z";
const BASE_FIELDS: &[&str] = &[
    "numero",
    "titulo",
    "severidad",
    "cvss",
    "cvss_vector",
    "cvss_version",
    "cwe",
    "estado",
    "afectados",
    "nuevo",
];
const BUSINESS_FIELDS: &[&str] = &[
    "modulo",
    "impacto_negocio",
    "categoria_riesgo",
    "causa_raiz",
];

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("pudu-export-contract-{}", uuid::Uuid::new_v4()));
        workspace::create_workspace(&root, "Sintetico").unwrap();
        fs::create_dir_all(root.join(PROJECT).join("findings")).unwrap();
        for file in [
            "project.yaml",
            "findings/001-acceso.md",
            "findings/002-oculto.md",
        ] {
            fs::copy(fixtures().join(file), root.join(PROJECT).join(file)).unwrap();
        }
        let fixture = Self(root);
        fixture.set_target(target(true, ExportProfile::IdentifiedV2));
        fixture
    }

    fn set_target(&self, target: ExportTarget) {
        let mut meta = workspace::read_workspace_meta(&self.0).unwrap();
        meta.export_targets = vec![target];
        workspace::write_workspace_meta(&self.0, &meta).unwrap();
    }

    fn payload(&self, target: &ExportTarget) -> Value {
        build_api_payload(
            &continuity::snapshot(&self.0, PROJECT).unwrap(),
            PROJECT,
            target,
            AT,
        )
        .unwrap()
    }

    fn prepare(&self) -> PreparedExport {
        PreparedExport::new(&self.0, PROJECT, "demo").unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/export")
}
fn expected(name: &str) -> Value {
    serde_json::from_slice(&fs::read(fixtures().join(format!("{name}.json"))).unwrap()).unwrap()
}
fn target(business: bool, profile: ExportProfile) -> ExportTarget {
    let fields = BASE_FIELDS
        .iter()
        .chain(if business { BUSINESS_FIELDS } else { &[] })
        .map(|value| (*value).to_string())
        .collect();
    ExportTarget {
        name: "demo".into(),
        url: "https://receiver.example.invalid/import".into(),
        profile,
        fields,
        include_summary: true,
        project_fields: if business {
            vec![
                "environment".into(),
                "exposure".into(),
                "external_reference".into(),
            ]
        } else {
            vec![]
        },
    }
}

#[test]
fn standalone_fixtures_match_legacy_v026_partial_and_v2() {
    let f = Fixture::new();
    for (name, target) in [
        ("legacy-0.0.25", target(false, ExportProfile::Legacy)),
        ("legacy-0.0.26", target(true, ExportProfile::Legacy)),
        ("identified-v2", target(true, ExportProfile::IdentifiedV2)),
    ] {
        let payload = f.payload(&target);
        assert_eq!(payload, expected(name), "{name}");
        let text = payload.to_string();
        assert!(!text.contains("NO_EXPORTABLE"));
        assert!(!text.contains("hidden"));
        assert!(!text.contains("revision"));
        assert!(!text.contains("plan_remediacion"));
    }
    let partial = ExportTarget {
        fields: vec!["titulo".into(), "modulo".into()],
        include_summary: false,
        project_fields: vec!["environment".into()],
        ..target(true, ExportProfile::Legacy)
    };
    assert_eq!(f.payload(&partial), expected("partial"));
}

#[test]
fn optional_empty_fixture_distinguishes_null_empty_and_omitted() {
    let f = Fixture::new();
    let mut project = workspace::read_project_meta(&f.0, PROJECT).unwrap();
    project.ambiente.clear();
    project.exposicion.clear();
    project.external_reference = None;
    workspace::write_project_meta(&f.0, PROJECT, &project).unwrap();
    let mut finding = workspace::load_finding(&f.0, PROJECT, "001-acceso").unwrap();
    finding.meta.modulo.clear();
    finding.meta.impacto_negocio.clear();
    finding.meta.categoria_riesgo.clear();
    finding.meta.causa_raiz.clear();
    workspace::write_finding(&f.0, PROJECT, &finding).unwrap();
    assert_eq!(
        f.payload(&target(true, ExportProfile::Legacy)),
        expected("optional-empty")
    );
    let v2 = f.payload(&target(true, ExportProfile::IdentifiedV2));
    assert!(v2["project"].get("external_reference").is_none());
}

#[test]
fn identities_are_required_in_v2_and_never_selected_into_legacy() {
    let f = Fixture::new();
    let no_fields = ExportTarget {
        fields: vec![],
        project_fields: vec![],
        include_summary: false,
        ..target(true, ExportProfile::IdentifiedV2)
    };
    let value = f.payload(&no_fields);
    assert_eq!(value["findings"][0].as_object().unwrap().len(), 1);
    assert!(value["findings"][0]["uid"].is_string());
    assert!(value["project"].get("external_reference").is_none());
    let legacy = ExportTarget {
        fields: vec!["uid".into()],
        profile: ExportProfile::Legacy,
        ..no_fields
    };
    assert!(f.payload(&legacy)["findings"][0].get("uid").is_none());

    let path = f.0.join(PROJECT).join("findings/002-oculto.md");
    let original = fs::read_to_string(&path).unwrap().replace("\r\n", "\n");
    for changed in [
        original.replace("uid: 21f06e17-57ed-49ca-9ba0-66dfd382a3c5\n", ""),
        original.replace("21f06e17-57ed-49ca-9ba0-66dfd382a3c5", "invalid"),
        original.replace(
            "21f06e17-57ed-49ca-9ba0-66dfd382a3c5",
            "459da17c-28fc-4680-b6cf-ab3b6e186648",
        ),
    ] {
        fs::write(&path, &changed).unwrap();
        assert!(PreparedExport::new(&f.0, PROJECT, "demo").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), changed);
        f.payload(&target(false, ExportProfile::Legacy));
    }
}

#[test]
fn preview_confirm_and_http_request_have_identical_bytes_without_network() {
    let f = Fixture::new();
    let prepared = f.prepare();
    let view = prepared.view();
    assert_eq!(
        view.destination_url,
        "https://receiver.example.invalid/import"
    );
    assert_eq!(view.profile, ExportProfile::IdentifiedV2);
    let preview = view.payload;
    let (url, body) = prepared.confirm(&f.0, PROJECT, "demo").unwrap();
    assert_eq!(preview.as_bytes(), body.as_bytes());
    let client = reqwest::Client::new();
    let request = build_request(&client, &url, "synthetic-test-token", body).unwrap();
    // Doble de transporte: inspecciona la solicitud preparada, nunca execute()/send().
    assert_eq!(request.method(), reqwest::Method::POST);
    assert_eq!(
        request.body().unwrap().as_bytes().unwrap(),
        preview.as_bytes()
    );
    assert_eq!(
        request.headers()[reqwest::header::CONTENT_TYPE],
        "application/json"
    );
    assert_eq!(
        request.headers()[reqwest::header::AUTHORIZATION],
        "Bearer synthetic-test-token"
    );
    assert!(!preview.contains("synthetic-test-token"));
    assert!(build_request(&client, "http://example.invalid", "", String::new()).is_err());
}

#[test]
fn source_changes_additions_deletions_and_target_changes_invalidate_preview() {
    for change in [
        "body",
        "project",
        "add",
        "delete",
        "target-url",
        "target-profile",
        "target-fields",
        "target-summary",
        "target-project-fields",
    ] {
        let f = Fixture::new();
        let prepared = f.prepare();
        match change {
            "body" => {
                let mut finding = workspace::load_finding(&f.0, PROJECT, "001-acceso").unwrap();
                finding.body.push_str("\nCambio MCP");
                workspace::write_finding(&f.0, PROJECT, &finding).unwrap();
            }
            "project" => {
                let mut project = workspace::read_project_meta(&f.0, PROJECT).unwrap();
                project.name.push_str("_v2");
                workspace::write_project_meta(&f.0, PROJECT, &project).unwrap();
            }
            "add" => {
                workspace::create_finding(&f.0, PROJECT, "V3").unwrap();
            }
            "delete" => {
                workspace::delete_finding(&f.0, PROJECT, "001-acceso").unwrap();
            }
            _ => {
                let mut target = target(true, ExportProfile::IdentifiedV2);
                match change {
                    "target-url" => target.url.push_str("/v2"),
                    "target-profile" => target.profile = ExportProfile::Legacy,
                    "target-fields" => target.fields.clear(),
                    "target-summary" => target.include_summary = false,
                    "target-project-fields" => target.project_fields.clear(),
                    _ => unreachable!(),
                }
                f.set_target(target);
            }
        }
        assert!(prepared.confirm(&f.0, PROJECT, "demo").is_err(), "{change}");
    }
    let f = Fixture::new();
    assert!(f.prepare().confirm(&f.0, "other", "demo").is_err());
    assert!(f.prepare().confirm(&f.0, PROJECT, "other").is_err());
    assert!(f
        .prepare()
        .confirm(Path::new("other"), PROJECT, "demo")
        .is_err());
}

#[test]
fn repeated_previews_and_case_a_preserve_identity_while_number_changes() {
    let f = Fixture::new();
    let target = target(true, ExportProfile::IdentifiedV2);
    let first = f.payload(&target);
    assert_eq!(first, f.payload(&target));
    let new = workspace::create_finding(&f.0, PROJECT, "V3").unwrap();
    workspace::reorder_findings(&f.0, PROJECT, vec![new.id.clone(), "001-acceso".into()]).unwrap();
    let second = f.payload(&target);
    assert_eq!(second["project"]["uid"], first["project"]["uid"]);
    assert_eq!(second["findings"][1]["uid"], first["findings"][0]["uid"]);
    assert_eq!(second["findings"][1]["numero"], 2);
    assert_ne!(second["findings"][0]["uid"], first["findings"][0]["uid"]);
    assert_eq!(second["summary"]["total"], 2);
}

#[test]
fn unicode_excerpt_never_splits_utf8() {
    let body = "ñ界𐐀".repeat(800);
    let excerpt = response_excerpt(&body, 2000);
    assert_eq!(excerpt.chars().count(), 2003);
    assert!(excerpt.ends_with("..."));
    assert_eq!(response_excerpt("á", 1), "á");
}
