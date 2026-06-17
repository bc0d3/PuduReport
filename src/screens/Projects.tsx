import { useState } from "react";
import * as api from "../lib/api";
import type { ProjectSummary, WorkspaceMeta } from "../lib/types";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";

interface Props {
  workspace: WorkspaceMeta;
  projects: ProjectSummary[];
  welcome: boolean;
  onReload: () => Promise<void> | void;
  onSelect: (id: string) => void;
}

export function Projects({ workspace, projects, welcome, onReload, onSelect }: Props) {
  const { guard } = useToast();
  const [creating, setCreating] = useState(false);

  async function handleExample() {
    const summary = await guard(api.createExampleProject(), "Proyecto de ejemplo creado");
    if (summary) {
      await onReload();
      onSelect(summary.id);
    }
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
          <div className="empty">
            No hay proyectos todavia. Crea uno o carga el de ejemplo.
          </div>
        ) : (
          <div className="card-grid">
            {projects.map((p) => (
              <div key={p.id} className="card clickable" onClick={() => onSelect(p.id)}>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <i className="ti ti-folder" style={{ color: "var(--accent)", fontSize: 18 }} />
                  <strong>{p.name}</strong>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {p.client || "Sin cliente"} · {p.finding_count} hallazgo
                  {p.finding_count === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
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

  async function create() {
    if (!name.trim()) return;
    const summary = await guard(api.createProject(name, client), "Proyecto creado");
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
