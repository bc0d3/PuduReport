// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

type Tool = "arrow" | "rect";

interface Shape {
  tool: Tool;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

interface Props {
  /** URL cargable de la imagen a anotar (ya resuelta, ver resolveSrc). */
  src: string;
  onCancel: () => void;
  /** PNG final como data URL ("data:image/png;base64,..."). */
  onConfirm: (dataUrl: string) => void;
}

const COLORS = ["#e5484d", "#f5a623", "#2ecc71", "#3b82f6", "#ffffff", "#111111"];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, lineWidth: number) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.tool === "rect") {
    ctx.strokeRect(
      Math.min(s.x1, s.x2),
      Math.min(s.y1, s.y2),
      Math.abs(s.x2 - s.x1),
      Math.abs(s.y2 - s.y1),
    );
    return;
  }
  const headLen = lineWidth * 4.5;
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(s.x2, s.y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s.x2, s.y2);
  ctx.lineTo(s.x2 - headLen * Math.cos(angle - Math.PI / 6), s.y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(s.x2 - headLen * Math.cos(angle + Math.PI / 6), s.y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/**
 * Editor de anotaciones sobre una imagen ya insertada: flecha o rectangulo,
 * en canvas plano (sin dependencias nuevas). Al confirmar devuelve un PNG
 * aplanado; la imagen original en disco no se toca.
 */
export function ImageAnnotator({ src, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lineWidthRef = useRef(4);
  const draft = useRef<Shape | null>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      lineWidthRef.current = Math.max(4, Math.round(img.naturalWidth / 220));
      setReady(true);
    };
    img.onerror = () => setLoadError(true);
    img.src = src;
  }, [src]);

  function redraw(withDraft?: Shape | null) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !img || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const all = withDraft ? [...shapes, withDraft] : shapes;
    for (const s of all) drawShape(ctx, s, lineWidthRef.current);
  }

  useEffect(() => {
    if (ready) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shapes]);

  function toCanvasPoint(e: ReactMouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function onDown(e: ReactMouseEvent) {
    if (!ready) return;
    const { x, y } = toCanvasPoint(e);
    draft.current = { tool, x1: x, y1: y, x2: x, y2: y, color };
  }

  function onMove(e: ReactMouseEvent) {
    if (!draft.current) return;
    const { x, y } = toCanvasPoint(e);
    draft.current = { ...draft.current, x2: x, y2: y };
    redraw(draft.current);
  }

  function onUp() {
    if (!draft.current) return;
    const s = draft.current;
    draft.current = null;
    // Ignora un click sin arrastre (no alcanza a formar una figura visible).
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4) {
      setShapes((prev) => [...prev, s]);
    } else {
      redraw();
    }
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onConfirm(canvas.toDataURL("image/png"));
  }

  return (
    <div className="popover-backdrop" onClick={onCancel}>
      <div
        className="popover"
        style={{ width: "min(92vw, 960px)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Anotar imagen</h3>
        <div className="md-toolbar">
          <button
            className={tool === "arrow" ? "active" : ""}
            title="Flecha"
            onClick={(e) => {
              e.preventDefault();
              setTool("arrow");
            }}
          >
            <i className="ti ti-arrow-up-right" /> Flecha
          </button>
          <button
            className={tool === "rect" ? "active" : ""}
            title="Rectangulo"
            onClick={(e) => {
              e.preventDefault();
              setTool("rect");
            }}
          >
            <i className="ti ti-square" /> Rectangulo
          </button>
          <span className="md-sep" />
          {COLORS.map((c) => (
            <button
              key={c}
              title={c}
              onClick={(e) => {
                e.preventDefault();
                setColor(c);
              }}
              style={{
                width: 22,
                height: 22,
                minWidth: 22,
                padding: 0,
                borderRadius: "50%",
                background: c,
                border: color === c ? "2px solid var(--text-primary)" : "1px solid var(--border)",
              }}
            />
          ))}
          <span className="md-sep" />
          <button
            title="Deshacer"
            disabled={shapes.length === 0}
            onClick={(e) => {
              e.preventDefault();
              setShapes((prev) => prev.slice(0, -1));
            }}
          >
            <i className="ti ti-arrow-back-up" />
          </button>
          <button
            title="Borrar todo"
            disabled={shapes.length === 0}
            onClick={(e) => {
              e.preventDefault();
              setShapes([]);
            }}
          >
            <i className="ti ti-trash" />
          </button>
        </div>
        <div
          style={{
            border: "1px solid var(--border)",
            borderTop: "none",
            borderRadius: "0 0 var(--radius-control) var(--radius-control)",
            overflow: "auto",
            maxHeight: "68vh",
            minHeight: 160,
            background: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loadError ? (
            <p className="faint" style={{ padding: 40 }}>
              No se pudo cargar la imagen.
            </p>
          ) : (
            <>
              {!ready && (
                <p className="faint" style={{ padding: 40, color: "#ccc" }}>
                  Cargando imagen...
                </p>
              )}
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: "100%",
                  maxHeight: "68vh",
                  cursor: "crosshair",
                  display: ready ? "block" : "none",
                }}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
              />
            </>
          )}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn primary" onClick={confirm} disabled={!ready}>
            <i className="ti ti-check" />
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
