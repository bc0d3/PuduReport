// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "ok" | "error" | "info";

interface ToastState {
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  notify: (message: string, kind?: ToastKind) => void;
  /** Ejecuta una promesa y notifica el error si falla. Devuelve el resultado o undefined. */
  guard: <T>(promise: Promise<T>, okMessage?: string) => Promise<T | undefined>;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const guard = useCallback(
    async <T,>(promise: Promise<T>, okMessage?: string): Promise<T | undefined> => {
      try {
        const result = await promise;
        if (okMessage) {
          notify(okMessage, "ok");
        }
        return result;
      } catch (err) {
        notify(String(err), "error");
        return undefined;
      }
    },
    [notify],
  );

  return (
    <ToastContext.Provider value={{ notify, guard }}>
      {children}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de ToastProvider");
  }
  return ctx;
}
