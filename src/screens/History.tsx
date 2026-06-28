// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { GitBranch, GitChange, GitCommit, GitState } from "../lib/types";
import { useToast } from "../components/Toast";

interface Props {
  projectId: string | null;
  /** Nombre del proyecto (el reporte) cuyo historial se muestra. */
  projectName?: string;
  /** Ruta absoluta del workspace, para ver donde se guarda. */
  workspacePath?: string | null;
  onPickProject: () => void;
}

const STATUS_META: Record<string, { icon: string; color: string }> = {
  new: { icon: "ti-plus", color: "var(--sev-low)" },
  modified: { icon: "ti-pencil", color: "var(--sev-medium)" },
  deleted: { icon: "ti-minus", color: "var(--sev-critical)" },
  renamed: { icon: "ti-arrow-right", color: "var(--accent)" },
};

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

function FileRow({ change }: { change: GitChange }) {
  const meta = STATUS_META[change.status] ?? { icon: "ti-file", color: "var(--text-muted)" };
  return (
    <div className="row" style={{ gap: 8, alignItems: "center" }}>
      <i
        className={`ti ${meta.icon}`}
        style={{ color: meta.color, fontSize: 14, width: 15, textAlign: "center" }}
      />
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11.5,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {change.path}
      </span>
    </div>
  );
}

export function History({ projectId, projectName, workspacePath, onPickProject }: Props) {
  const { guard } = useToast();
  const [state, setState] = useState<GitState | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branch, setBranch] = useState<GitBranch | null>(null);
  const [message, setMessage] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [files, setFiles] = useState<GitChange[]>([]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [st, log, br] = await Promise.all([
      guard(api.gitStatus(projectId)),
      guard(api.gitLog(projectId)),
      guard(api.gitBranches()),
    ]);
    if (st) setState(st);
    if (log) setCommits(log);
    if (br) setBranch(br.find((b) => b.current) ?? null);
  }, [guard, projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Archivos del commit seleccionado (o los cambios sin guardar), solo del proyecto.
  useEffect(() => {
    if (!projectId) return;
    if (sel === "wip") {
      setFiles(state?.changes ?? []);
    } else if (sel) {
      guard(api.gitCommitFiles(projectId, sel)).then((f) => f && setFiles(f));
    } else {
      setFiles([]);
    }
  }, [guard, projectId, sel, state]);

  async function handleInit() {
    const done = await guard(api.gitInit(), "Repositorio git inicializado");
    if (done !== undefined) reload();
  }

  async function doCommit() {
    const msg = message.trim();
    if (!msg) return;
    const done = await guard(api.gitCommit(msg), "Version guardada");
    if (done !== undefined) {
      setMessage("");
      setSel(null);
      reload();
    }
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

  const changes = state?.changes ?? [];
  const dirty = changes.length;
  const selCommit = sel && sel !== "wip" ? commits.find((c) => c.hash === sel) : null;

  if (state && !state.initialized) {
    return (
      <div className="center-screen">
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "28px 24px",
            textAlign: "center",
            maxWidth: 440,
          }}
        >
          <i className="ti ti-git-branch" style={{ fontSize: 28, color: "var(--text-muted)" }} />
          <p style={{ color: "var(--text-secondary)", margin: "10px 0 4px" }}>
            El workspace de este reporte todavia no tiene control de versiones.
          </p>
          {workspacePath && (
            <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>
              {workspacePath}
            </p>
          )}
          <button className="btn primary" onClick={handleInit}>
            <i className="ti ti-git-branch" />
            Inicializar git
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-history" style={{ color: "var(--text-secondary)" }} />
            <strong style={{ fontSize: 14 }}>Historial — {projectName || projectId}</strong>
            {branch && (
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--accent)",
                  background: "var(--accent-bg)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <i className="ti ti-git-branch" style={{ fontSize: 12 }} /> {branch.name}
              </span>
            )}
          </div>
          {workspacePath && (
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`Guardado en ${workspacePath}`}
            >
              {workspacePath}
            </div>
          )}
        </div>
        <button className="btn" onClick={reload} title="Actualizar">
          <i className="ti ti-refresh" />
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {dirty > 0 && (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <input
                className="input"
                placeholder="Que cambiaste en esta version..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doCommit()}
                style={{ flex: 1 }}
              />
              <button className="btn primary" onClick={doCommit} disabled={!message.trim()}>
                <i className="ti ti-git-commit" />
                Guardar version
              </button>
            </div>
          )}

          {dirty > 0 && (
            <div
              onClick={() => setSel("wip")}
              style={{
                display: "grid",
                gridTemplateColumns: "30px 1fr",
                alignItems: "center",
                cursor: "pointer",
                background: sel === "wip" ? "var(--accent-bg)" : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    border: "1.5px dashed var(--sev-medium)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ padding: "9px 10px 9px 2px", color: "var(--sev-medium)", fontStyle: "italic", fontSize: 12.5 }}>
                {dirty} {dirty === 1 ? "cambio sin guardar" : "cambios sin guardar"}
              </div>
            </div>
          )}

          {commits.length === 0 ? (
            <div className="empty" style={{ margin: 16 }}>
              Todavia no hay versiones guardadas de este reporte.
            </div>
          ) : (
            commits.map((c, i) => (
              <div
                key={c.hash}
                onClick={() => setSel(c.hash)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "30px 1fr",
                  alignItems: "center",
                  cursor: "pointer",
                  background: sel === c.hash ? "var(--accent-bg)" : "transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
                  {(i > 0 || dirty > 0) && (
                    <span style={{ position: "absolute", top: -11, height: 16, width: 2, background: "var(--accent)" }} />
                  )}
                  {i < commits.length - 1 && (
                    <span style={{ position: "absolute", top: 14, bottom: -11, width: 2, background: "var(--accent)" }} />
                  )}
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", zIndex: 1 }} />
                </div>
                <div style={{ padding: "8px 10px 8px 2px", minWidth: 0, fontSize: 12.5 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                    {c.message}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                    {c.author} &middot; {relativeDate(c.timestamp)} &middot;{" "}
                    <span style={{ fontFamily: "var(--mono)" }}>{c.hash}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            width: 230,
            flexShrink: 0,
            borderLeft: "1px solid var(--border)",
            background: "var(--bg-elev)",
            padding: 14,
            overflowY: "auto",
            fontSize: 12,
          }}
        >
          {!sel ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
              Elegi una version para ver sus archivos.
            </div>
          ) : sel === "wip" ? (
            <>
              <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: 12 }}>
                Cambios sin guardar
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {files.map((f) => (
                  <FileRow key={f.path} change={f} />
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4 }}>
                {selCommit?.message}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-muted)", margin: "3px 0 12px" }}>
                {sel}
                {selCommit && ` · ${relativeDate(selCommit.timestamp)}`}
              </div>
              {selCommit && (
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
                  {selCommit.author}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                {files.length} {files.length === 1 ? "archivo de este reporte" : "archivos de este reporte"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {files.map((f) => (
                  <FileRow key={f.path} change={f} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
