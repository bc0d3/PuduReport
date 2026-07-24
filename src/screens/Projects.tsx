// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api";
import type {
  ProjectAssignment,
  ProjectStatus,
  ProjectSummary,
  SeverityCounts,
  WorkspaceMeta,
} from "../lib/types";
import { PROJECT_TYPES, typeInfo } from "../lib/projectTypes";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_LETTER, SEVERITY_ORDER } from "../lib/severity";
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

type SortKey =
  | "name"
  | "client"
  | "project_type"
  | "start_date"
  | "end_date"
  | "finding_count"
  | "project_status";

/** Columnas del tablero Kanban, en orden. Tambien se reusa para el badge de
 * estado en la vista de tabla. */
const COLUMNS: { key: ProjectStatus; label: string; icon: string }[] = [
  { key: "todo", label: "To Do", icon: "ti-list-check" },
  { key: "inprogress", label: "In Progress", icon: "ti-progress" },
  { key: "done", label: "Done", icon: "ti-circle-check" },
  { key: "assigned", label: "Asignado / En cierre", icon: "ti-user-check" },
];

function statusLabel(status: ProjectStatus): string {
  return COLUMNS.find((c) => c.key === status)?.label ?? status;
}

/** Orden completo de todos los proyectos actuales: el explicito guardado
 * (filtrado a ids vigentes) mas los que falten, al final, por nombre. Sirve
 * de base estable para las operaciones de arrastrar-y-soltar del tablero. */
function effectiveOrder(projects: ProjectSummary[], order: string[]): string[] {
  const known = order.filter((id) => projects.some((p) => p.id === id));
  const knownSet = new Set(known);
  const missing = projects
    .filter((p) => !knownSet.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => p.id);
  return [...known, ...missing];
}

export function Projects({ workspace, projects, welcome, onReload, onSelect, onDelete }: Props) {
  const { guard } = useToast();
  // El tablero es la vista principal; cada usuario puede cambiar a tabla y su
  // eleccion se recuerda (igual que el tema).
  const [view, setView] = useState<"table" | "board">(
    () =>
      (window.localStorage.getItem("pudu-projects-view") as "table" | "board" | null) ?? "board",
  );
  function changeView(v: "table" | "board") {
    setView(v);
    window.localStorage.setItem("pudu-projects-view", v);
  }
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [toRename, setToRename] = useState<ProjectSummary | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("client");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  // Conteo de hallazgos por severidad por proyecto (para las tarjetas del
  // tablero), del mismo origen que el dashboard. Se refresca cuando cambia la
  // lista de proyectos (no en cada tecla de busqueda: depende de `projects`,
  // no de `rows`).
  const [severityByProject, setSeverityByProject] = useState<Map<string, SeverityCounts>>(
    () => new Map(),
  );
  useEffect(() => {
    let cancelled = false;
    void guard(api.workspaceStats()).then((s) => {
      if (!cancelled && s) {
        setSeverityByProject(new Map(s.projects.map((p) => [p.id, p.severity])));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [guard, projects]);

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
            <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: "center" }}>
              <div className="field" style={{ maxWidth: 360, marginBottom: 0, flex: 1 }}>
                <input
                  className="input"
                  placeholder="Buscar por nombre o cliente..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button
                  className={`btn small ${view === "board" ? "primary" : ""}`}
                  onClick={() => changeView("board")}
                  title="Vista de tablero"
                >
                  <i className="ti ti-layout-kanban" />
                  Tablero
                </button>
                <button
                  className={`btn small ${view === "table" ? "primary" : ""}`}
                  onClick={() => changeView("table")}
                  title="Vista de tabla"
                >
                  <i className="ti ti-table" />
                  Tabla
                </button>
              </div>
            </div>

            {view === "table" ? (
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
                    <th className="sortable" onClick={() => toggleSort("project_status")}>
                      Estado {sortIcon("project_status")}
                    </th>
                    <th className="sortable ta-right" onClick={() => toggleSort("finding_count")}>
                      Hallazgos {sortIcon("finding_count")}
                    </th>
                    <th className="sortable" onClick={() => toggleSort("start_date")}>
                      Inicio {sortIcon("start_date")}
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
                        <td>
                          <span className="mini-tag">
                            <i
                              className={`ti ${COLUMNS.find((c) => c.key === p.project_status)?.icon ?? ""}`}
                              style={{ marginRight: 4 }}
                            />
                            {statusLabel(p.project_status)}
                          </span>
                        </td>
                        <td className="ta-right">{p.finding_count}</td>
                        <td>{p.start_date || "—"}</td>
                        <td>{p.end_date || "—"}</td>
                        <td className="ta-right">
                          <button
                            className="btn small"
                            title="Renombrar proyecto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setToRename(p);
                            }}
                          >
                            <i className="ti ti-edit" />
                          </button>
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
                      <td colSpan={8} style={{ color: "var(--text-muted)" }}>
                        Ningun proyecto coincide con la busqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <Board
                projects={rows}
                order={workspace.project_order}
                severityByProject={severityByProject}
                onSelect={onSelect}
                onReload={onReload}
                onRename={setToRename}
                onRequestDelete={setToDelete}
              />
            )}
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

      {toRename && (
        <RenameProjectModal
          project={toRename}
          onClose={() => setToRename(null)}
          onRenamed={async () => {
            setToRename(null);
            await onReload();
          }}
        />
      )}
    </>
  );
}

interface PendingAssign {
  project: ProjectSummary;
  /** Id de la tarjeta sobre la que se solto (para insertar justo ahi); null = al final de la columna. */
  targetCardId: string | null;
}

function Board({
  projects,
  order,
  severityByProject,
  onSelect,
  onReload,
  onRename,
  onRequestDelete,
}: {
  projects: ProjectSummary[];
  order: string[];
  severityByProject: Map<string, SeverityCounts>;
  onSelect: (id: string) => void;
  onReload: () => Promise<void> | void;
  onRename: (p: ProjectSummary) => void;
  onRequestDelete: (p: ProjectSummary) => void;
}) {
  const { notify } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ProjectStatus | null>(null);
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(null);

  // Arrastre por Pointer Events en vez de drag-and-drop nativo HTML5: en el
  // WKWebView de macOS (usado por Tauri) el DnD nativo entre columnas es poco
  // confiable (dragover/drop no siempre disparan). Mouse events (mismo patron
  // que CoverCanvas.tsx) funcionan igual en cualquier webview.
  const dragIdRef = useRef<string | null>(null);
  const overColRef = useRef<ProjectStatus | null>(null);
  const overCardRef = useRef<string | null>(null);
  const candidateRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  function setDrag(id: string | null) {
    dragIdRef.current = id;
    setDragId(id);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragIdRef.current && candidateRef.current) {
        const dx = e.clientX - candidateRef.current.x;
        const dy = e.clientY - candidateRef.current.y;
        if (Math.hypot(dx, dy) > 4) {
          draggedRef.current = true;
          window.getSelection()?.removeAllRanges();
          setDrag(candidateRef.current.id);
        }
      }
      if (dragIdRef.current) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const cardEl = el?.closest<HTMLElement>("[data-kanban-card]") ?? null;
        const cardId =
          cardEl && cardEl.dataset.kanbanCard !== dragIdRef.current
            ? (cardEl.dataset.kanbanCard ?? null)
            : null;
        const colEl = el?.closest<HTMLElement>("[data-kanban-column]") ?? null;
        const colKey = (colEl?.dataset.kanbanColumn as ProjectStatus | undefined) ?? null;
        overCardRef.current = cardId;
        overColRef.current = colKey;
        setOverCol(colKey);
      }
    }
    function onUp() {
      candidateRef.current = null;
      const id = dragIdRef.current;
      if (id) {
        const col = overColRef.current;
        const card = overCardRef.current;
        setDrag(null);
        setOverCol(null);
        overColRef.current = null;
        overCardRef.current = null;
        if (col) void applyDrop(id, col, card);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullOrder = useMemo(() => effectiveOrder(projects, order), [projects, order]);

  const byStatus = useMemo(() => {
    const map: Record<ProjectStatus, ProjectSummary[]> = {
      todo: [],
      inprogress: [],
      done: [],
      assigned: [],
    };
    const byId = new Map(projects.map((p) => [p.id, p]));
    for (const id of fullOrder) {
      const p = byId.get(id);
      if (p) map[p.project_status].push(p);
    }
    return map;
  }, [projects, fullOrder]);

  function computeNewOrder(id: string, targetCardId: string | null): string[] {
    const ids = fullOrder.filter((x) => x !== id);
    if (targetCardId === null) {
      ids.push(id);
    } else {
      const to = ids.indexOf(targetCardId);
      ids.splice(to < 0 ? ids.length : to, 0, id);
    }
    return ids;
  }

  async function applyDrop(id: string, targetStatus: ProjectStatus, targetCardId: string | null) {
    const dragged = projects.find((p) => p.id === id);
    setDragId(null);
    setOverCol(null);
    if (!dragged) return;
    const statusChanged = dragged.project_status !== targetStatus;
    if (statusChanged && targetStatus === "assigned") {
      setPendingAssign({ project: dragged, targetCardId });
      return;
    }
    try {
      if (statusChanged) {
        const meta = await api.loadProject(id);
        await api.saveProject(id, { ...meta, project_status: targetStatus });
      }
      await api.reorderProjects(computeNewOrder(id, targetCardId));
      await onReload();
    } catch (err) {
      notify(String(err), "error");
    }
  }

  async function confirmAssign(name: string, email: string) {
    if (!pendingAssign) return;
    try {
      await api.assignProjectClosure(pendingAssign.project.id, name, email);
      await api.reorderProjects(
        computeNewOrder(pendingAssign.project.id, pendingAssign.targetCardId),
      );
      notify("Proyecto asignado", "ok");
      setPendingAssign(null);
      await onReload();
    } catch (err) {
      notify(String(err), "error");
    }
  }

  return (
    <>
      <div className={`kanban-board ${dragId ? "dragging" : ""}`}>
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            data-kanban-column={col.key}
            className={`kanban-column ${overCol === col.key ? "drag-over" : ""}`}
          >
            <h4>
              <i className={`ti ${col.icon}`} />
              {col.label}
              <span className="kanban-count">{byStatus[col.key].length}</span>
            </h4>
            <div className="kanban-cards">
              {byStatus[col.key].map((p) => {
                const info = typeInfo(p.project_type);
                const sev = severityByProject.get(p.id);
                const presentSev = sev ? SEVERITY_ORDER.filter((s) => sev[s] > 0) : [];
                return (
                  <div
                    key={p.id}
                    data-kanban-card={p.id}
                    className={`kanban-card ${p.id === dragId ? "dragging" : ""}`}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      // Evita que el navegador inicie una seleccion de texto al
                      // arrastrar la tarjeta.
                      e.preventDefault();
                      draggedRef.current = false;
                      candidateRef.current = { id: p.id, x: e.clientX, y: e.clientY };
                    }}
                    onClick={() => {
                      if (draggedRef.current) return;
                      onSelect(p.id);
                    }}
                  >
                    <div className="kanban-card-actions">
                      <button
                        className="kanban-icon-btn"
                        title="Renombrar proyecto"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRename(p);
                        }}
                      >
                        <i className="ti ti-edit" />
                      </button>
                      <button
                        className="kanban-icon-btn danger"
                        title="Eliminar proyecto"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestDelete(p);
                        }}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                    <div className="kanban-card-title">{p.name}</div>
                    {p.client && <div className="kanban-card-sub">{p.client}</div>}
                    {presentSev.length > 0 && (
                      <div className="kanban-sev">
                        {presentSev.map((s) => (
                          <span
                            key={s}
                            className="kanban-sev-chip"
                            style={{ background: SEVERITY_COLOR[s] }}
                            title={`${SEVERITY_LABEL[s]}: ${sev![s]}`}
                          >
                            {SEVERITY_LETTER[s]}
                            {sev![s]}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="kanban-card-meta">
                      <span className="mini-tag">
                        <i className={`ti ${info.icon}`} style={{ marginRight: 4 }} />
                        {info.label}
                      </span>
                      <span
                        className="kanban-vulns"
                        title={`${p.finding_count} hallazgo${p.finding_count === 1 ? "" : "s"}`}
                      >
                        <i className="ti ti-bug" />
                        {p.finding_count}
                      </span>
                      {p.assignment_history.length > 0 && (
                        <AssignmentBadge history={p.assignment_history} />
                      )}
                    </div>
                  </div>
                );
              })}
              {byStatus[col.key].length === 0 && <div className="kanban-empty">Sin proyectos</div>}
            </div>
          </div>
        ))}
      </div>

      {pendingAssign && (
        <AssignClosureModal
          project={pendingAssign.project}
          onClose={() => setPendingAssign(null)}
          onConfirm={confirmAssign}
        />
      )}
    </>
  );
}

function AssignmentBadge({ history }: { history: ProjectAssignment[] }) {
  const [open, setOpen] = useState(false);
  const last = history[history.length - 1];

  return (
    <div
      className="assignment-badge"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
    >
      <i className="ti ti-user-check" title={`Asignado a ${last.name}`} />
      {open && (
        <div className="assignment-popover" onClick={(e) => e.stopPropagation()}>
          {history
            .slice()
            .reverse()
            .map((a, i) => (
              <div key={i} className="assignment-entry">
                <strong>{a.name}</strong>
                <div className="faint">{a.email}</div>
                <div className="faint">{a.assigned_at}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function AssignClosureModal({
  project,
  onClose,
  onConfirm,
}: {
  project: ProjectSummary;
  onClose: () => void;
  onConfirm: (name: string, email: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      await onConfirm(name.trim(), email.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Asignar cierre de "${project.name}"`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            onClick={confirm}
            disabled={!name.trim() || !email.trim() || saving}
          >
            Asignar
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nombre</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Correo electronico</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
        />
      </div>
    </Modal>
  );
}

function RenameProjectModal({
  project,
  onClose,
  onRenamed,
}: {
  project: ProjectSummary;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const { notify } = useToast();
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const meta = await api.loadProject(project.id);
      await api.saveProject(project.id, { ...meta, name: trimmed });
      notify("Proyecto renombrado", "ok");
      onRenamed();
    } catch (err) {
      notify(String(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Renombrar proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={rename} disabled={!name.trim() || saving}>
            Guardar
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nombre del proyecto</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && rename()}
          autoFocus
        />
      </div>
    </Modal>
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
