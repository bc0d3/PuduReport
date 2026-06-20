import { useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Severity, WorkspaceStats } from "../lib/types";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_LETTER, SEVERITY_ORDER } from "../lib/severity";
import { typeInfo } from "../lib/projectTypes";
import { useToast } from "./Toast";

interface Props {
  onSelect: (id: string) => void;
  /** Cambia cuando la lista de proyectos cambia, para refrescar los conteos. */
  refreshDep: number;
}

/** Dashboard de Inicio: visibilidad de cuanto se ha hecho en el workspace. */
export function Dashboard({ onSelect, refreshDep }: Props) {
  const { guard } = useToast();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void guard(api.workspaceStats()).then((s) => {
      if (!cancelled && s) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [guard, refreshDep]);

  if (!stats) return null;

  const sev = stats.severity;
  const critHigh = sev.critical + sev.high;
  const total = stats.total_findings;

  return (
    <div className="dashboard">
      <div className="dash-cards">
        <StatCard label="Proyectos" value={stats.total_projects} />
        <StatCard label="Hallazgos totales" value={total} />
        <StatCard
          label="Criticas + altas"
          value={critHigh}
          accent={critHigh > 0 ? "var(--sev-critical)" : undefined}
        />
        <StatCard label="Abiertos" value={stats.open_findings} />
      </div>

      {total > 0 && (
        <div className="card">
          <div className="dash-label">Distribucion total por severidad</div>
          <div className="sev-bar">
            {SEVERITY_ORDER.filter((s) => sev[s] > 0).map((s) => (
              <div
                key={s}
                style={{ flex: sev[s], background: SEVERITY_COLOR[s] }}
                title={`${SEVERITY_LABEL[s]}: ${sev[s]}`}
              />
            ))}
          </div>
          <div className="sev-legend">
            {SEVERITY_ORDER.map((s) => (
              <span key={s}>
                <span className="sev-dot" style={{ background: SEVERITY_COLOR[s] }} />
                {SEVERITY_LABEL[s]} <b>{sev[s]}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="dash-label">Hallazgos por proyecto</div>
        {stats.projects.map((p) => {
          const info = typeInfo(p.project_type);
          const present = SEVERITY_ORDER.filter((s) => p.severity[s] > 0);
          return (
            <button key={p.id} className="dash-proj" onClick={() => onSelect(p.id)}>
              <i className="ti ti-folder" />
              <div className="dash-proj-name">
                <div className="tpl-title">{p.name}</div>
                <div className="faint">
                  {p.client || "—"} · {info.label}
                </div>
              </div>
              <div className="dash-badges">
                {present.length === 0 ? (
                  <span className="faint" style={{ fontSize: 12 }}>
                    sin hallazgos
                  </span>
                ) : (
                  present.map((s: Severity) => (
                    <span key={s} className="dash-badge-col">
                      <span
                        className="dash-badge"
                        style={{ background: SEVERITY_COLOR[s] }}
                        title={SEVERITY_LABEL[s]}
                      >
                        {SEVERITY_LETTER[s]}
                      </span>
                      <span className="dash-badge-n">{p.severity[s]}</span>
                    </span>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}
