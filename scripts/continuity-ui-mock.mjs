// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

// Doble manual de IPC, solo para el navegador de desarrollo (ver docs/continuity.md).
// No se importa desde la aplicacion ni hace POST, usa datos sinteticos en memoria.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import fixture from "../tests/fixtures/export/identified-v2.json";

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const project = {
  name: "Portal Demo",
  client: "Empresa Demo",
  gerencia: "",
  area: "",
  ambiente: "qa",
  exposicion: "interno",
  project_type: "pentest",
  osid: "",
  template_override: "",
  start_date: "2026-10-01",
  end_date: "2026-10-20",
  scope: [],
  team: [],
  project_status: "in_progress",
  assignment_history: [],
  sections: [],
  layout: [],
  finding_order: ["001-acceso"],
  causas_raiz: [],
  plan_remediacion: [],
  revision: "p1",
};
const finding = {
  id: "001-acceso",
  meta: {
    title: "Acceso indebido a información",
    severity: "high",
    cvss_version: "3.1",
    cvss: "8.1",
    cvss_vector: fixture.findings[0].cvss_vector,
    cwe: ["CWE-862"],
    status: "open",
    affected: [],
    hidden: false,
    new_in_retest: false,
    hidden_fields: [],
    modulo: "Administración",
    impacto_negocio: "",
    categoria_riesgo: "",
    causa_raiz: "",
    revision: "f1",
  },
  body: "## Descripcion\n\nEjemplo sintetico\n\n## Impacto\n\nImpacto\n\n## Prueba de concepto\n\nPoC\n\n## Remediacion\n\nCorregir",
};
const target = {
  name: "Demo legacy",
  url: "https://receiver.example.invalid/import",
  profile: "legacy",
  fields: ["numero", "titulo", "severidad"],
  include_summary: true,
  project_fields: [],
};
const workspace = {
  name: "Validacion sintetica",
  project_order: [],
  branding: {
    logo_path: "",
    cover_background: "",
    primary_color: "#1f6fb2",
    cover_color: "",
    cover_layout: "centered",
  },
  watermark: { enabled: true, text: "DEMO", opacity: 0.1, size: 64 },
  export_targets: [
    target,
    {
      ...target,
      name: "Demo v2",
      profile: "identified_v2",
      project_fields: ["external_reference"],
    },
  ],
};
const state = {
  projects: { "portal-demo": project },
  findings: { "portal-demo": [finding] },
  workspace,
  calls: [],
  posts: [],
  revision: 1,
  httpError: false,
  holdSend: false,
  keychainError: false,
  tokenMissing: false,
};
globalThis.__puduTest = state;
const identity = (id) => ({
  project_uid: state.projects[id].uid ?? null,
  findings: state.findings[id].length,
  missing: Number(!state.projects[id].uid) + state.findings[id].filter((f) => !f.meta.uid).length,
  conflicts: [],
});
const projects = () =>
  Object.entries(state.projects).map(([id, meta]) => ({
    ...meta,
    id,
    finding_count: state.findings[id].length,
  }));
mockWindows("main");
mockIPC(
  async (command, args = {}) => {
    state.calls.push({ command, args: clone(args) });
    const id = args.projectId ?? args.id;
    switch (command) {
      case "pick_workspace":
        return "C:/synthetic/continuity";
      case "list_recent_workspaces":
        return [];
      case "open_workspace":
      case "get_workspace_meta":
        return clone(workspace);
      case "list_projects":
        return clone(projects());
      case "list_pdf_templates":
        return [
          {
            name: "pentest",
            title: "Pentest",
            description: "",
            tags: [],
            builtin: true,
            family: "findings",
          },
        ];
      case "workspace_stats":
        return {
          total_projects: projects().length,
          total_findings: 1,
          open_findings: 1,
          severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
          projects: [],
        };
      case "load_project":
        return clone(state.projects[id]);
      case "list_findings":
        return clone(state.findings[id]);
      case "load_finding":
        return clone(state.findings[id].find((f) => f.id === args.findingId));
      case "save_project": {
        if (args.meta.revision !== state.projects[id].revision)
          throw new Error("revision obsoleta");
        state.projects[id] = { ...args.meta, revision: `p${++state.revision}` };
        return clone(state.projects[id]);
      }
      case "save_finding": {
        const index = state.findings[id].findIndex((f) => f.id === args.finding.id);
        if (args.finding.meta.revision !== state.findings[id][index].meta.revision)
          throw new Error("revision obsoleta");
        state.findings[id][index] = {
          ...args.finding,
          meta: { ...args.finding.meta, revision: `f${++state.revision}` },
        };
        return clone(state.findings[id][index]);
      }
      case "duplicate_finding":
      case "create_finding": {
        const copy = clone(
          command === "duplicate_finding"
            ? state.findings[id].find((f) => f.id === args.findingId)
            : finding,
        );
        copy.id = `new-${++state.revision}`;
        copy.meta.uid = globalThis.crypto.randomUUID();
        copy.meta.title =
          command === "duplicate_finding" ? `${copy.meta.title} (copia)` : args.title;
        state.findings[id].push(copy);
        return clone(copy);
      }
      case "preview_pdf":
        return [];
      case "inspect_project_identity":
        return identity(id);
      case "prepare_project_identity": {
        state.projects[id].uid ??= fixture.project.uid;
        for (const f of state.findings[id]) f.meta.uid ??= globalThis.crypto.randomUUID();
        state.projects[id].revision = `p${++state.revision}`;
        return identity(id);
      }
      case "copy_project": {
        const key = `copy-${++state.revision}`;
        state.projects[key] = {
          ...clone(state.projects[id]),
          name: args.name,
          external_reference: args.externalReference ?? undefined,
        };
        state.findings[key] = clone(state.findings[id]);
        if (args.mode === "independent") {
          state.projects[key].uid = globalThis.crypto.randomUUID();
          for (const f of state.findings[key]) f.meta.uid = globalThis.crypto.randomUUID();
        }
        return key;
      }
      case "list_export_targets":
        return clone(workspace.export_targets);
      case "save_export_target": {
        const index = workspace.export_targets.findIndex((t) => t.name === args.target.name);
        if (index < 0) workspace.export_targets.push(args.target);
        else workspace.export_targets[index] = args.target;
        return;
      }
      case "has_export_token":
        if (state.keychainError) throw new Error("keychain bloqueado (doble)");
        return !state.tokenMissing;
      case "set_export_token":
        return;
      case "preview_export_payload": {
        const t = workspace.export_targets.find((t) => t.name === args.targetName);
        if (t.profile === "identified_v2" && identity(id).missing)
          throw new Error("faltan UUID; usa Preparar identidades antes de exportar v2");
        const value = clone(fixture);
        value.project = {
          id,
          name: state.projects[id].name,
          client: "Empresa Demo",
          type: "pentest",
          start_date: "2026-10-01",
          end_date: "2026-10-20",
        };
        value.findings = state.findings[id]
          .filter((f) => !f.meta.hidden)
          .map((f, index) =>
            Object.fromEntries([
              ...t.fields.map((key) => [
                key,
                { numero: index + 1, titulo: f.meta.title, severidad: f.meta.severity }[key] ??
                  null,
              ]),
              ...(t.profile === "identified_v2" ? [["uid", f.meta.uid]] : []),
            ]),
          );
        value.summary = {
          total: value.findings.length,
          by_severity: { high: value.findings.length },
        };
        if (!t.include_summary) delete value.summary;
        if (t.profile === "identified_v2") {
          value.project.uid = state.projects[id].uid;
          if (
            t.project_fields.includes("external_reference") &&
            state.projects[id].external_reference
          )
            value.project.external_reference = state.projects[id].external_reference;
        } else delete value.schema_version;
        const prepared = {
          preparation_id: `prep-${++state.revision}`,
          destination_url: t.url,
          profile: t.profile,
          payload: JSON.stringify(value, null, 2),
        };
        state.prepared = clone(prepared);
        return prepared;
      }
      case "send_export_to_api": {
        if (state.prepared?.preparation_id !== args.preparationId)
          throw new Error("preparacion obsoleta");
        state.posts.push(clone(state.prepared));
        state.prepared = null;
        if (state.holdSend)
          await new Promise((resolve) => {
            state.releaseSend = resolve;
          });
        return state.httpError
          ? { ok: false, status: 422, body: "incompatible (doble)" }
          : { ok: true, status: 202, body: "aceptado (doble)" };
      }
      default:
        if (command.startsWith("plugin:")) return;
        throw new Error(`IPC no previsto por el doble: ${command}`);
    }
  },
  { shouldMockEvents: true },
);
