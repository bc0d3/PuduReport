import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { GitChange, GitCommit, GitState } from "../lib/types";
import { useToast } from "../components/Toast";

interface Props {
  projectId: string | null;
  onPickProject: () => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "Nuevo", color: "var(--sev-low)" },
  modified: { label: "Mod", color: "var(--sev-medium)" },
  deleted: { label: "Borrado", color: "var(--sev-critical)" },
  renamed: { label: "Renom", color: "var(--accent)" },
};

/** Fecha relativa simple a partir de segundos Unix. */
function relativeDate(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "hace instantes";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} dias`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function History({ projectId, onPickProject }: Props) {
  const { guard } = useToast();
  const [state, setState] = useState<GitState | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [st, log] = await Promise.all([
      guard(api.gitStatus(projectId)),
      guard(api.gitLog(projectId)),
    ]);
    if (st) setState(st);
    if (log) setCommits(log);
  }, [guard, projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleInit() {
    const done = await guard(api.gitInit(), "Repositorio git inicializado");
    if (done !== undefined) reload();
  }

  async function handleCommit() {
    const msg = window.prompt("Mensaje de la version:");
    if (!msg) return;
    const done = await guard(api.gitCommit(msg), "Version guardada");
    if (done !== undefined) reload();
  }

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para ver su historial.
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn primary" onClick={onPickProject}>
              <i className="ti ti-folder" />
              Ir a proyectos
            </button>
          </div>
        </div>
      </div>
    );
  }

  const changes: GitChange[] = state?.changes ?? [];

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Historial</h1>
          <p className="sub">Versiones de este proyecto en el workspace (git local).</p>
        </div>
        {state?.initialized && (
          <button className="btn primary" onClick={handleCommit} disabled={changes.length === 0}>
            <i className="ti ti-git-commit" />
            Guardar version
          </button>
        )}
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        {state && !state.initialized ? (
          <div className="empty">
            Este workspace no tiene control de versiones todavia.
            <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
              <button className="btn primary" onClick={handleInit}>
                <i className="ti ti-git-branch" />
                Inicializar git
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="git-head">
              <h3>Cambios sin guardar ({changes.length})</h3>
            </div>
            {changes.length === 0 ? (
              <div className="empty">Sin cambios pendientes. Todo esta versionado.</div>
            ) : (
              <div className="git-card">
                {changes.map((c) => {
                  const meta = STATUS_META[c.status] ?? {
                    label: c.status,
                    color: "var(--text-muted)",
                  };
                  return (
                    <div className="git-row" key={c.path}>
                      <span className="git-chip" style={{ background: meta.color }}>
                        {meta.label}
                      </span>
                      <span className="git-path">{c.path}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="git-head" style={{ marginTop: 20 }}>
              <h3>Versiones anteriores</h3>
            </div>
            {commits.length === 0 ? (
              <div className="empty">Todavia no hay versiones guardadas de este proyecto.</div>
            ) : (
              <div className="git-card">
                {commits.map((c) => (
                  <div className="git-row" key={c.hash}>
                    <span className="git-dot" />
                    <div className="git-commit-msg">
                      <div className="m">{c.message}</div>
                      <div className="meta">
                        {c.author} &middot; {relativeDate(c.timestamp)}
                      </div>
                    </div>
                    <span className="git-hash">{c.hash}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
