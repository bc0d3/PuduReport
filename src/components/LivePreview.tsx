// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { useToast } from "./Toast";

interface Props {
  projectId: string | null;
  /** Cambiar este valor fuerza un refresco (ej. tras guardar el proyecto). */
  refreshKey?: number;
  /** Texto cuando no hay proyecto seleccionado. */
  emptyHint?: string;
  /** Notifica el estado de carga al contenedor (para spinners/botones). */
  onLoadingChange?: (loading: boolean) => void;
}

/**
 * Vista previa del PDF renderizada con el motor real de Typst (previewPdf
 * devuelve un PNG por pagina). Reutilizable: la pantalla de Vista previa y el
 * editor de reporte la embeben. El render lee del disco, asi que el contenedor
 * debe GUARDAR antes de incrementar `refreshKey`.
 */
export function LivePreview({ projectId, refreshKey, emptyHint, onLoadingChange }: Props) {
  const { guard } = useToast();
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Guard anti-solapamiento: si llega un refresco mientras compila, se marca
  // pendiente y se vuelve a compilar al terminar (Typst no cachea).
  const busy = useRef(false);
  const pending = useRef(false);

  const run = useCallback(async () => {
    if (!projectId) return;
    if (busy.current) {
      pending.current = true;
      return;
    }
    busy.current = true;
    setLoading(true);
    do {
      pending.current = false;
      const result = await guard(api.previewPdf(projectId));
      if (result) setPages(result);
    } while (pending.current);
    busy.current = false;
    setLoading(false);
  }, [guard, projectId]);

  useEffect(() => {
    run();
  }, [run, refreshKey]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  if (!projectId) {
    return <div className="empty">{emptyHint ?? "Selecciona un proyecto para previsualizar."}</div>;
  }

  if (loading && pages.length === 0) {
    return <div className="empty">Compilando el PDF con Typst...</div>;
  }
  if (pages.length === 0) {
    return <div className="empty">Sin vista previa todavia.</div>;
  }
  return (
    <div className="pdf-pages">
      {pages.map((src, i) => (
        <img key={i} className="pdf-page" src={src} alt={`Pagina ${i + 1}`} />
      ))}
    </div>
  );
}
