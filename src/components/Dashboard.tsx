// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useState } from "react";
import * as api from "../lib/api";
import type { ProjectSummary, Severity, WorkspaceStats } from "../lib/types";
import { SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_LETTER, SEVERITY_ORDER } from "../lib/severity";
import { projectSchedule, todayDay, shortDate, PROJECT_STATUS_LABEL } from "../lib/projectSchedule";
import { typeInfo } from "../lib/projectTypes";
import { useToast } from "./Toast";

interface Props {
  onSelect: (id: string) => void;
  /** Cambia cuando la lista de proyectos cambia, para refrescar los conteos. */
  refreshDep: number;
  onOpenBoard: () => void;
}

/** Dashboard de Inicio: visibilidad de cuanto se ha hecho en el workspace. */
export function Dashboard({ onSelect, refreshDep, onOpenBoard }: Props) {
  const { guard } = useToast();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<"active" | "due" | "overdue" | "all">("active");
  const [query, setQuery] = useState("");
  const [today, setToday] = useState(() => todayDay());

  useEffect(() => {
    const update = () => setToday(todayDay());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    void guard(Promise.all([api.workspaceStats(), api.listProjects()])).then((result) => {
      if (cancelled) return;
      if (!result) {
        setLoadState("error");
        return;
      }
      setStats(result[0]);
      setProjects(result[1]);
      setLoadState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [guard, refreshDep, reload]);

  if (loadState === "loading")
    return (
      <div className="overview-state" role="status">
        <i className="ti ti-loader-2 activity-spinner" aria-hidden="true" />
        Cargando resumen...
      </div>
    );
  if (loadState === "error" || !stats)
    return (
      <div className="overview-state" role="alert">
        <i className="ti ti-alert-circle" aria-hidden="true" />
        <h2>No se pudo cargar el resumen</h2>
        <p>Revisa que la carpeta del workspace siga disponible.</p>
        <button className="btn" onClick={() => setReload((value) => value + 1)}>
          Reintentar
        </button>
      </div>
    );

  const scheduled = projects.map((project) => ({
    project,
    schedule: projectSchedule(project, today),
  }));
  const active = scheduled.filter(({ project }) => project.project_status !== "done");
  const due = active.filter(
    ({ schedule }) => schedule.kind === "today" || schedule.kind === "upcoming",
  );
  const overdue = active.filter(({ schedule }) => schedule.kind === "overdue");
  const agenda = active
    .filter(
      ({ schedule }) =>
        schedule.end !== null && schedule.remaining !== null && schedule.remaining >= 0,
    )
    .sort(
      (a, b) => a.schedule.end! - b.schedule.end! || a.project.name.localeCompare(b.project.name),
    )
    .slice(0, 5);
  const source =
    filter === "active"
      ? active
      : filter === "due"
        ? due
        : filter === "overdue"
          ? overdue
          : scheduled;
  const visible = source
    .filter(({ project }) =>
      `${project.name} ${project.client} ${typeInfo(project.project_type).label}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(a.project.project_status === "done") - Number(b.project.project_status === "done") ||
        (a.schedule.end ?? Infinity) - (b.schedule.end ?? Infinity) ||
        a.project.name.localeCompare(b.project.name),
    );
  const tabs = [
    { id: "active" as const, label: "Activos", count: active.length },
    { id: "due" as const, label: "Proximos 7 dias", count: due.length },
    { id: "overdue" as const, label: "Vencidos", count: overdue.length },
    { id: "all" as const, label: "Todos", count: projects.length },
  ];

  const sev = stats.severity;
  const critHigh = sev.critical + sev.high;
  const total = stats.total_findings;

  return (
    <div className="dashboard work-overview">
      <div className="overview-briefing">
        <div>
          <span className="eyebrow">TU JORNADA · {shortDate(today)}</span>
          <h2>
            {active.length
              ? `${active.length} ${active.length === 1 ? "proyecto por avanzar" : "proyectos por avanzar"}`
              : "Todo al dia"}
          </h2>
          <p>
            {overdue.length
              ? `${overdue.length} con fecha de cierre vencida. Revisa su estado o ajusta sus fechas.`
              : due.length
                ? `${due.length} con cierre en los proximos 7 dias, incluido hoy.`
                : "Revisa tus plazos y continua con tu siguiente proyecto."}
          </p>
        </div>
        <button className="btn" onClick={onOpenBoard}>
          <i className="ti ti-layout-kanban" aria-hidden="true" />
          Abrir Kanban de proyectos
          <i className="ti ti-arrow-up-right" aria-hidden="true" />
        </button>
      </div>
      <div className="overview-layout">
        <section className="overview-work" aria-label="Proyectos y plazos">
          <div className="overview-tools">
            <div className="overview-filters" role="group" aria-label="Filtrar proyectos">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={filter === tab.id ? "active" : ""}
                  aria-pressed={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                  <span>{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="list-search">
              <i className="ti ti-search" aria-hidden="true" />
              <input
                aria-label="Buscar en el resumen"
                placeholder="Proyecto, cliente o tipo..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="overview-projects overview-project-list">
            {visible.map(({ project, schedule }) => {
              const info = typeInfo(project.project_type);
              const count =
                stats.projects.find((item) => item.id === project.id)?.total ??
                project.finding_count;
              return (
                <button
                  key={project.id}
                  className="work-project"
                  onClick={() => onSelect(project.id)}
                >
                  <span className="work-project-top">
                    <span className="project-emblem">
                      <i className={`ti ${info.icon}`} aria-hidden="true" />
                    </span>
                    <span className="work-status" data-status={project.project_status}>
                      {PROJECT_STATUS_LABEL[project.project_status]}
                    </span>
                    <i className="ti ti-arrow-up-right project-open" aria-hidden="true" />
                  </span>
                  <strong className="work-project-name">{project.name}</strong>
                  <span className="work-project-client">
                    {project.client || "Sin cliente"} · {info.label}
                  </span>
                  <span className="work-project-deadline" data-kind={schedule.kind}>
                    <i
                      className={`ti ${schedule.kind === "overdue" ? "ti-clock-exclamation" : "ti-calendar-event"}`}
                      aria-hidden="true"
                    />
                    {schedule.label}
                    <span>{schedule.end !== null ? shortDate(schedule.end) : "—"}</span>
                  </span>
                  {schedule.elapsed !== null && schedule.kind !== "done" ? (
                    <span className="work-time">
                      <span className="work-time-label">
                        Plazo transcurrido<span>{schedule.elapsed}%</span>
                      </span>
                      <span className="work-time-track" aria-hidden="true">
                        <span style={{ width: `${schedule.elapsed}%` }} />
                      </span>
                    </span>
                  ) : (
                    <span className="work-time-hint">
                      {schedule.kind === "done"
                        ? "Proyecto marcado como finalizado"
                        : schedule.kind === "invalid"
                          ? "Corrige las fechas desde Reporte"
                          : project.start_date && project.start_date === project.end_date
                            ? "Inicio y cierre en el mismo dia"
                            : "Define inicio y fin desde Reporte"}
                    </span>
                  )}
                  <span className="work-project-bottom">
                    <span>
                      {info.usesFindings
                        ? `${count} ${count === 1 ? "hallazgo" : "hallazgos"}`
                        : "Reporte narrativo"}
                    </span>
                    <span>
                      Abrir proyecto
                      <i className="ti ti-arrow-right" aria-hidden="true" />
                    </span>
                  </span>
                </button>
              );
            })}
            {!visible.length && (
              <div className="overview-state" role="status">
                <i className="ti ti-folder-check" aria-hidden="true" />
                <strong>{query ? "No hay coincidencias" : "Sin proyectos en este grupo"}</strong>
                <p>
                  {query
                    ? "Prueba otro nombre, cliente o tipo."
                    : "Puedes consultar todos o crear un nuevo proyecto."}
                </p>
                <button
                  className="btn small"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Ver todos
                </button>
              </div>
            )}
          </div>
        </section>
        <aside className="overview-agenda" aria-label="Proximos cierres">
          <div className="overview-section-title">
            <i className="ti ti-calendar-week" aria-hidden="true" />
            <h3>Proximos cierres</h3>
          </div>
          <p className="overview-caption">Segun la fecha de fin del proyecto</p>
          {agenda.length ? (
            <div className="agenda-list">
              {agenda.map(({ project, schedule }) => (
                <button
                  className="agenda-item"
                  key={project.id}
                  onClick={() => onSelect(project.id)}
                >
                  <span className="agenda-date">{shortDate(schedule.end!)}</span>
                  <span>
                    <strong>{project.name}</strong>
                    <small>{schedule.label}</small>
                  </span>
                  <i className="ti ti-chevron-right" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <p className="overview-caption agenda-empty">
              No hay cierres programados. Agrega fechas en los datos del reporte para planificar tu
              trabajo.
            </p>
          )}
          <div className="overview-section-title">
            <i className="ti ti-list-check" aria-hidden="true" />
            <h3>Estado del trabajo</h3>
          </div>
          <dl className="overview-stages">
            {(["todo", "inprogress", "assigned", "done"] as const).map((status) => (
              <div key={status}>
                <dt>{PROJECT_STATUS_LABEL[status]}</dt>
                <dd>{projects.filter((project) => project.project_status === status).length}</dd>
              </div>
            ))}
          </dl>
          <p className="overview-caption">
            El estado lo defines en Proyectos. El tiempo transcurrido no mide el avance de la
            revision.
          </p>
        </aside>
      </div>
      <section className="overview-security" aria-label="Resumen de hallazgos">
        <div className="overview-section-title">
          <i className="ti ti-shield-search" aria-hidden="true" />
          <h3>Hallazgos del workspace</h3>
        </div>
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
      </section>
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
