// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import type { ProjectSummary } from "./types";

const DAY_MS = 86_400_000;

/** Dia calendario independiente de la duracion local del dia (cambios de hora). */
export function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return Math.floor(date.getTime() / DAY_MS);
}

/** Usa la fecha local del usuario; no el dia UTC, que puede diferir por la noche. */
export function todayDay(now = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

export function shortDate(day: number): string {
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(day * DAY_MS),
  );
}

export const PROJECT_STATUS_LABEL = {
  todo: "Por iniciar",
  inprogress: "En curso",
  assigned: "Asignado / En cierre",
  done: "Finalizado",
} as const;

export interface ProjectSchedule {
  kind: "done" | "invalid" | "undated" | "overdue" | "today" | "upcoming" | "scheduled";
  label: string;
  end: number | null;
  remaining: number | null;
  elapsed: number | null;
}

/** Plazo de calendario; nunca representa porcentaje de revision o de remediacion. */
export function projectSchedule(
  project: Pick<ProjectSummary, "start_date" | "end_date" | "project_status">,
  today: number,
): ProjectSchedule {
  const start = calendarDay(project.start_date);
  const end = calendarDay(project.end_date);
  const invalid =
    (!!project.start_date && start === null) ||
    (!!project.end_date && end === null) ||
    (start !== null && end !== null && start > end);
  const remaining = end === null || invalid ? null : end - today;
  const elapsed =
    invalid || start === null || end === null || end <= start
      ? null
      : Math.round(Math.max(0, Math.min(1, (today - start) / (end - start))) * 100);
  const base = { end: invalid ? null : end, remaining, elapsed };
  if (project.project_status === "done") return { ...base, kind: "done", label: "Finalizado" };
  if (invalid) return { ...base, kind: "invalid", label: "Revisar fechas" };
  if (remaining === null) return { ...base, kind: "undated", label: "Sin fecha de cierre" };
  if (remaining < 0)
    return {
      ...base,
      kind: "overdue",
      label: `Vencio hace ${-remaining} ${remaining === -1 ? "dia" : "dias"}`,
    };
  if (remaining === 0) return { ...base, kind: "today", label: "Cierra hoy" };
  return {
    ...base,
    kind: remaining <= 7 ? "upcoming" : "scheduled",
    label: `Quedan ${remaining} ${remaining === 1 ? "dia" : "dias"}`,
  };
}
