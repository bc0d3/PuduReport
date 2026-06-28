// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useMemo, useState } from "react";
import * as api from "../lib/api";
import type { ProjectSummary, WorkspaceMeta } from "../lib/types";
import { PROJECT_TYPES, typeInfo } from "../lib/projectTypes";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dashboard } from "../components/Dashboard";
import { useToast } from "../components/Toast";

interface Props {
  workspace: WorkspaceMeta;
  projects: ProjectSummary[];
  welcome: boolean;
  onReload: () => Promise<void> | void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

type SortKey = "name" | "client" | "project_type" | "end_date" | "finding_count";

export function Projects({ workspace, projects, welcome, onReload, onSelect, onDelete }: Props) {
  const { guard } = useToast();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("client");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  async function handleExample() {
    const summary = await guard(api.createExampleProject(), "Proyecto de ejemplo creado");
    if (summary) {
      await onReload();
      onSelect(summary.id);
    }
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = projects.filter(
      (p) => q === "" || p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q),
    );
    const val = (p: ProjectSummary): string | number =>
      sortKey === "finding_count" ? p.finding_count : (p[sortKey] ?? "").toString().toLowerCase();
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }, [projects, query, sortKey, sortDir]);

  function sortIcon(key: SortKey) {
    if (key !== sortKey) return null;
    return <i className={`ti ${sortDir === 1 ? "ti-chevron-up" : "ti-chevron-down"}`} />;
  }

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>{welcome ? `Bienvenido a ${workspace.name}` : "Proyectos"}</h1>
          <p className="sub">
            {projects.length} proyecto{projects.length === 1 ? "" : "s"} · local y offline
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={handleExample}>
            <i className="ti ti-sparkles" />
            Cargar ejemplo
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <i className="ti ti-plus" />
            Nuevo proyecto
          </button>
        </div>
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        {projects.length === 0 ? (
          <div className="empty">No hay proyectos todavia. Crea uno o carga el de ejemplo.</div>
        ) : welcome ? (
          <Dashboard onSelect={onSelect} refreshDep={projects.length} />
        ) : (
          <>
            <div className="field" style={{ maxWidth: 360, marginBottom: 10 }}>
              <input
                className="input"
                placeholder="Buscar por nombre o cliente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <table className="tpl-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort("name")}>
                    Proyecto {sortIcon("name")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("client")}>
                    Cliente {sortIcon("client")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("project_type")}>
                    Tipo {sortIcon("project_type")}
                  </th>
                  <th className="sortable ta-right" onClick={() => toggleSort("finding_count")}>
                    Hallazgos {sortIcon("finding_count")}
                  </th>
                  <th className="sortable" onClick={() => toggleSort("end_date")}>
                    Fecha {sortIcon("end_date")}
                  </th>
                  <th className="ta-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const info = typeInfo(p.project_type);
                  return (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onSelect(p.id)}>
                      <td>
                        <div className="tpl-name">
                          <i className="ti ti-folder" />
                          <span className="tpl-title">{p.name}</span>
                        </div>
                      </td>
                      <td>{p.client || "—"}</td>
                      <td>
                        <span className="mini-tag">
                          <i className={`ti ${info.icon}`} style={{ marginRight: 4 }} />
                          {info.label}
                        </span>
                      </td>
                      <td className="ta-right">{p.finding_count}</td>
                      <td>{p.end_date || "—"}</td>
                      <td className="ta-right">
                        <button
                          className="btn small danger"
                          title="Eliminar proyecto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setToDelete(p);
                          }}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                      Ningun proyecto coincide con la busqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await onReload();
            onSelect(id);
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Eliminar proyecto"
          message={`Se eliminara el proyecto "${toDelete.name}" y todos sus hallazgos. Esta accion no se puede deshacer.`}
          onConfirm={() => onDelete(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </>
  );
}

function ProjectForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { guard } = useToast();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("pentest");

  async function create() {
    if (!name.trim()) return;
    const summary = await guard(api.createProject(name, client, type), "Proyecto creado");
    if (summary) onCreated(summary.id);
  }

  return (
    <Modal
      title="Nuevo proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={create} disabled={!name.trim()}>
            Crear
          </button>
        </>
      }
    >
      <div className="field">
        <label>Que vas a hacer?</label>
        <div className="cardsel-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {PROJECT_TYPES.map((t) => (
            <button
              key={t.value}
              className={`cardsel ${type === t.value ? "sel" : ""}`}
              onClick={() => setType(t.value)}
            >
              <i className={`ti ${t.icon}`} />
              {t.label}
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginTop: 6 }}>
          {typeInfo(type).desc}
        </p>
      </div>
      <div className="field">
        <label>Nombre del proyecto</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pentest Web ACME"
        />
      </div>
      <div className="field">
        <label>Cliente</label>
        <input
          className="input"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="ACME Corp"
        />
      </div>
    </Modal>
  );
}
