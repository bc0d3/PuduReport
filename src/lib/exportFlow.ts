// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import type { ApiSendResult, PreparedExport } from "./types";

export interface ExportContext {
  key: string;
  projectId: string;
  targetName: string;
}

export type ExportState =
  | { kind: "idle" }
  | { kind: "loading"; context: ExportContext }
  | {
      kind: "ready" | "sending";
      context: ExportContext;
      prepared: PreparedExport;
      hasToken: boolean;
    }
  | { kind: "error"; context: ExportContext; message: string };

interface Dependencies {
  flush: () => Promise<void>;
  prepare: (projectId: string, targetName: string) => Promise<PreparedExport>;
  hasToken: (targetName: string) => Promise<boolean>;
  send: (projectId: string, targetName: string, preparationId: string) => Promise<ApiSendResult>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "No se pudo completar la operacion";
}

/** Coordina respuestas tardias y doble envio; no cancela ni reintenta un POST. */
export function createExportFlow(deps: Dependencies, onChange: (state: ExportState) => void) {
  let generation = 0;
  let sending = false;
  let state: ExportState = { kind: "idle" };
  const publish = (next: ExportState) => {
    state = next;
    onChange(next);
  };

  return {
    invalidate() {
      generation += 1;
      publish({ kind: "idle" });
    },
    async prepare(context: ExportContext): Promise<void> {
      const request = ++generation;
      publish({ kind: "loading", context });
      try {
        await deps.flush();
        if (request !== generation) return;
        const [prepared, hasToken] = await Promise.all([
          deps.prepare(context.projectId, context.targetName),
          deps.hasToken(context.targetName),
        ]);
        if (request === generation) publish({ kind: "ready", context, prepared, hasToken });
      } catch (error) {
        if (request === generation)
          publish({ kind: "error", context, message: errorMessage(error) });
      }
    },
    async send(contextKey: string): Promise<ApiSendResult | undefined> {
      if (sending || state.kind !== "ready" || !state.hasToken || state.context.key !== contextKey)
        return;
      const ready = state;
      const request = generation;
      sending = true;
      publish({ ...ready, kind: "sending" });
      try {
        await deps.flush();
        if (request !== generation) return;
        const result = await deps.send(
          ready.context.projectId,
          ready.context.targetName,
          ready.prepared.preparation_id,
        );
        if (request !== generation) return;
        if (result.ok) publish({ kind: "idle" });
        else
          publish({
            kind: "error",
            context: ready.context,
            message: `La API respondio ${result.status}. ${result.body}`,
          });
        return result;
      } catch (error) {
        if (request === generation)
          publish({ kind: "error", context: ready.context, message: errorMessage(error) });
      } finally {
        sending = false;
      }
    },
  };
}
