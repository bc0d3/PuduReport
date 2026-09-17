// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "ok" | "error" | "info";

interface ToastState {
  id: number;
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
  const sequence = useRef(0);
  const timer = useRef<number>();
  const [paused, setPaused] = useState(false);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    setToast({ message, kind, id: ++sequence.current });
  }, []);

  useEffect(() => {
    if (!toast || paused) return;
    timer.current = window.setTimeout(() => setToast(null), toast.kind === "error" ? 8000 : 4000);
    return () => window.clearTimeout(timer.current);
  }, [toast, paused]);

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
      {toast && (
        <div
          key={toast.id}
          className={`toast ${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <i
            className={`ti ${toast.kind === "error" ? "ti-alert-circle" : toast.kind === "ok" ? "ti-circle-check" : "ti-info-circle"}`}
            aria-hidden="true"
          />
          <span>{toast.message}</span>
          <button
            className="icon-btn"
            aria-label="Cerrar notificacion"
            onClick={() => {
              setToast(null);
              setPaused(false);
            }}
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      )}
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
