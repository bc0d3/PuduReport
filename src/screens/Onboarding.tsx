import * as api from "../lib/api";
import type { WorkspaceMeta } from "../lib/types";
import { useToast } from "../components/Toast";

interface Props {
  onOpened: (meta: WorkspaceMeta, path: string) => void;
}

/** Pantalla inicial cuando no hay workspace abierto: crear o abrir uno. */
export function Onboarding({ onOpened }: Props) {
  const { guard } = useToast();

  async function handleCreate() {
    const path = await guard(api.pickWorkspace());
    if (!path) return;
    const name = window.prompt("Nombre del workspace:", "Mi workspace");
    if (!name) return;
    const meta = await guard(api.createWorkspace(path, name), "Workspace creado");
    if (meta) onOpened(meta, path);
  }

  async function handleOpen() {
    const path = await guard(api.pickWorkspace());
    if (!path) return;
    const meta = await guard(api.openWorkspace(path));
    if (meta) onOpened(meta, path);
  }

  return (
    <div className="center-screen">
      <div style={{ width: 680, maxWidth: "90vw" }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <i className="ti ti-shield-lock" style={{ color: "var(--accent)", fontSize: 24 }} />
          Bienvenido a Pudu<span style={{ color: "var(--accent)" }}>Report</span>
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Reportes de seguridad en PDF. Tus datos viven en una carpeta local que vos elegis; nada
          sale del equipo.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
          <div className="card">
            <i className="ti ti-folder-plus" style={{ fontSize: 24, color: "var(--accent)" }} />
            <h3 style={{ margin: "10px 0 4px", fontSize: 14 }}>Crear workspace</h3>
            <p className="muted" style={{ margin: "0 0 14px" }}>
              Elegi donde guardar todo. Se crea una carpeta de texto, versionable con git.
            </p>
            <button className="btn primary" onClick={handleCreate}>
              <i className="ti ti-plus" />
              Crear workspace
            </button>
          </div>
          <div className="card">
            <i className="ti ti-folder-open" style={{ fontSize: 24, color: "var(--text-muted)" }} />
            <h3 style={{ margin: "10px 0 4px", fontSize: 14 }}>Abrir existente</h3>
            <p className="muted" style={{ margin: "0 0 14px" }}>
              Abri un workspace que ya tengas en este equipo.
            </p>
            <button className="btn" onClick={handleOpen}>
              <i className="ti ti-folder-open" />
              Abrir existente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
