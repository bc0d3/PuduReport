import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { RecentWorkspace, WorkspaceMeta } from "../lib/types";
import { useToast } from "../components/Toast";

interface Props {
  onOpened: (meta: WorkspaceMeta, path: string) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

// Paleta para el avatar del workspace (estable por nombre, no aleatoria).
const AVATAR_COLORS = ["#1f6fb2", "#0f6e56", "#993c1d", "#7c3aed", "#b3261e", "#0e7490", "#9a6700"];

function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initial(name: string): string {
  const c = name.trim()[0];
  return c ? c.toUpperCase() : "?";
}

export function Welcome({ onOpened, dark, onToggleTheme }: Props) {
  const { guard } = useToast();
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    const list = await guard(api.listRecentWorkspaces());
    if (list) setRecents(list);
  }, [guard]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openPath(path: string) {
    const meta = await guard(api.openWorkspace(path));
    if (meta) onOpened(meta, path);
  }

  async function handleNew() {
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

  async function removeRecent(path: string) {
    await guard(api.removeRecentWorkspace(path));
    reload();
  }

  const q = query.trim().toLowerCase();
  const filtered = recents.filter(
    (r) => q === "" || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
  );

  return (
    <div className="welcome">
      <aside className="welcome-side">
        <div className="welcome-brand">
          <i className="ti ti-shield-lock" />
          <div>
            <div className="welcome-brand-name">
              Pudu<span style={{ color: "var(--accent)" }}>Report</span>
            </div>
            <div className="welcome-brand-sub">Reportes de seguridad, local-first</div>
          </div>
        </div>
        <button className="welcome-nav on">
          <i className="ti ti-folders" />
          Workspaces
        </button>
        <div className="welcome-side-foot">
          <button className="welcome-nav" onClick={onToggleTheme}>
            <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} />
            {dark ? "Modo claro" : "Modo oscuro"}
          </button>
        </div>
      </aside>

      <main className="welcome-main">
        <div className="welcome-top">
          <div className="welcome-search">
            <i className="ti ti-search" />
            <input
              placeholder="Buscar workspaces..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={handleNew}>
              <i className="ti ti-plus" />
              Nuevo
            </button>
            <button className="btn" onClick={handleOpen}>
              <i className="ti ti-folder-open" />
              Abrir
            </button>
          </div>
        </div>

        {recents.length === 0 ? (
          <div className="empty" style={{ marginTop: 24 }}>
            No hay workspaces todavia. Crea uno nuevo o abre una carpeta existente.
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty" style={{ marginTop: 24 }}>
            Ningun workspace coincide con la busqueda.
          </div>
        ) : (
          <div className="welcome-list">
            {filtered.map((r) => (
              <div
                key={r.path}
                className={`welcome-item ${r.exists ? "" : "missing"}`}
                onClick={() => r.exists && openPath(r.path)}
                title={r.exists ? r.path : "La carpeta ya no existe"}
              >
                <div className="welcome-avatar" style={{ background: avatarColor(r.name) }}>
                  {initial(r.name)}
                </div>
                <div className="welcome-item-text">
                  <div className="welcome-item-name">
                    {r.name}
                    {!r.exists && <span className="welcome-missing-tag">no encontrado</span>}
                  </div>
                  <div className="welcome-item-path">{r.path}</div>
                </div>
                <button
                  className="welcome-remove"
                  title="Quitar de recientes"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecent(r.path);
                  }}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
