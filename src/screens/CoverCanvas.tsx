// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Branding, CoverElement } from "../lib/types";

// Dimensiones del lienzo (proporcion A4). El PDF usa A4 (alto 842pt); las
// fuentes en pt se escalan a px por esa relacion para que el preview se parezca.
const CANVAS_W = 360;
const CANVAS_H = Math.round(CANVAS_W * 1.414);
const A4_PT_H = 842;
const ptToPx = (pt: number) => (pt > 0 ? pt : 12) * (CANVAS_H / A4_PT_H);

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clampW = (n: number) => Math.max(0.03, Math.min(1, n));

const KIND_LABEL: Record<CoverElement["kind"], string> = {
  logo: "Logo",
  title: "Titulo",
  client: "Cliente",
  subtitle: "Subtitulo",
  period: "Periodo",
  text: "Texto",
  image: "Imagen",
};

/** Genera elementos de portada por defecto a partir del branding actual. */
export function defaultCoverElements(b: Branding): CoverElement[] {
  const accent = b.cover_color || b.primary_color;
  const els: CoverElement[] = [];
  let y = 0.12;
  if (b.cover_show_logo && b.logo_path) {
    els.push({ kind: "logo", x: 0.12, y, w: 0.22 });
    y = 0.32;
  }
  els.push({
    kind: "title",
    x: 0.12,
    y,
    w: 0.76,
    font_size: 30,
    align: "left",
    weight: "bold",
    color: accent,
  });
  els.push({ kind: "client", x: 0.12, y: y + 0.1, w: 0.76, font_size: 16, align: "left" });
  if (b.cover_subtitle) {
    els.push({
      kind: "subtitle",
      x: 0.12,
      y: y + 0.16,
      w: 0.76,
      font_size: 13,
      align: "left",
      color: accent,
    });
  }
  if (b.cover_show_period) {
    els.push({ kind: "period", x: 0.12, y: 0.85, w: 0.76, font_size: 11, color: "#888888" });
  }
  return els;
}

interface Props {
  elements: CoverElement[];
  brand: string;
  logoSrc: string;
  subtitle: string;
  resolveSrc: (path: string) => string;
  onChange: (els: CoverElement[], debounced: boolean) => void;
  onUploadImage: () => Promise<string | null>;
}

export function CoverCanvas({
  elements,
  brand,
  logoSrc,
  subtitle,
  resolveSrc,
  onChange,
  onUploadImage,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const drag = useRef<{ i: number; offX: number; offY: number } | null>(null);
  const resize = useRef<{ i: number; startX: number; startW: number } | null>(null);
  // Estado vivo para los listeners globales: evita closures obsoletos (sin esto,
  // al soltar se revertia la posicion porque se usaba el array del primer render).
  const live = useRef({ elements, onChange });
  live.current = { elements, onChange };

  const norm = useCallback((clientX: number, clientY: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
  }, []);

  // Un unico par de listeners globales (montados una vez) maneja drag y resize
  // leyendo el estado mas reciente por ref.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const { elements, onChange } = live.current;
      if (drag.current) {
        const d = drag.current;
        const { x, y } = norm(e.clientX, e.clientY);
        const nx = clamp01(x - d.offX);
        const ny = clamp01(y - d.offY);
        onChange(
          elements.map((el, i) => (i === d.i ? { ...el, x: nx, y: ny } : el)),
          true,
        );
      } else if (resize.current) {
        const r = resize.current;
        const w = clampW(r.startW + (e.clientX - r.startX) / CANVAS_W);
        onChange(
          elements.map((el, i) => (i === r.i ? { ...el, w } : el)),
          true,
        );
      }
    }
    function onUp() {
      if (drag.current || resize.current) {
        drag.current = null;
        resize.current = null;
        const { elements, onChange } = live.current;
        onChange(elements, false); // persistir la posicion final
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [norm]);

  function patch(i: number, partial: Partial<CoverElement>, debounced: boolean) {
    onChange(
      elements.map((el, idx) => (idx === i ? { ...el, ...partial } : el)),
      debounced,
    );
  }

  function startDrag(e: ReactMouseEvent, i: number) {
    e.stopPropagation();
    setSel(i);
    const { x, y } = norm(e.clientX, e.clientY);
    drag.current = { i, offX: x - elements[i].x, offY: y - elements[i].y };
  }

  function startResize(e: ReactMouseEvent, i: number) {
    e.stopPropagation();
    setSel(i);
    resize.current = { i, startX: e.clientX, startW: elements[i].w };
  }

  function addText() {
    const next = [
      ...elements,
      {
        kind: "text" as const,
        x: 0.3,
        y: 0.3,
        w: 0.4,
        font_size: 12,
        align: "left" as const,
        content: "Texto",
      },
    ];
    onChange(next, false);
    setSel(next.length - 1);
  }

  async function addImage() {
    const src = await onUploadImage();
    if (!src) return;
    const next = [...elements, { kind: "image" as const, x: 0.3, y: 0.3, w: 0.25, src }];
    onChange(next, false);
    setSel(next.length - 1);
  }

  function remove(i: number) {
    onChange(
      elements.filter((_, idx) => idx !== i),
      false,
    );
    setSel(null);
  }

  function elementText(el: CoverElement): string {
    switch (el.kind) {
      case "title":
        return "Titulo del reporte";
      case "client":
        return "Cliente";
      case "subtitle":
        return subtitle || "Subtitulo";
      case "period":
        return "01/01/2026 — 15/01/2026";
      case "text":
        return el.content || "Texto";
      default:
        return "";
    }
  }

  const selected = sel !== null ? (elements[sel] ?? null) : null;

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <div>
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <button className="btn small" onClick={addText}>
            <i className="ti ti-text-plus" />
            Texto
          </button>
          <button className="btn small" onClick={() => void addImage()}>
            <i className="ti ti-photo-plus" />
            Imagen
          </button>
        </div>
        <div
          ref={canvasRef}
          onMouseDown={() => setSel(null)}
          style={{
            position: "relative",
            width: CANVAS_W,
            height: CANVAS_H,
            background: "#ffffff",
            border: "1px solid var(--border-strong)",
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            userSelect: "none",
          }}
        >
          {elements.map((el, i) => {
            const src = el.kind === "logo" ? logoSrc : el.kind === "image" ? resolveSrc(el.src ?? "") : "";
            const isImg = el.kind === "logo" || el.kind === "image";
            return (
              <div
                key={i}
                onMouseDown={(e) => startDrag(e, i)}
                style={{
                  position: "absolute",
                  left: `${el.x * 100}%`,
                  top: `${el.y * 100}%`,
                  width: `${el.w * 100}%`,
                  cursor: "move",
                  outline: sel === i ? `1.5px solid ${brand}` : "1px dashed transparent",
                  outlineOffset: 2,
                }}
              >
                {isImg ? (
                  src ? (
                    <img src={src} alt="" style={{ width: "100%", display: "block" }} />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: 40,
                        background: brand + "22",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: brand,
                        fontSize: 11,
                      }}
                    >
                      {KIND_LABEL[el.kind]}
                    </div>
                  )
                ) : (
                  <div
                    style={{
                      fontSize: ptToPx(el.font_size ?? 0),
                      fontWeight: el.weight === "bold" ? 700 : 400,
                      textAlign: el.align ?? "left",
                      color: el.color || "#1a1a1a",
                      lineHeight: 1.2,
                      wordBreak: "break-word",
                    }}
                  >
                    {elementText(el)}
                  </div>
                )}
                {sel === i && (
                  <div
                    onMouseDown={(e) => startResize(e, i)}
                    title="Redimensionar"
                    style={{
                      position: "absolute",
                      right: -5,
                      bottom: -5,
                      width: 10,
                      height: 10,
                      background: brand,
                      borderRadius: 2,
                      cursor: "nwse-resize",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="faint" style={{ fontSize: 11, marginTop: 8, maxWidth: CANVAS_W }}>
          <strong>Beta:</strong> el lienzo libre es una funcion nueva y puede tener fallas.
          Arrastra los elementos; el tirador de la esquina redimensiona. Titulo, cliente y periodo
          muestran un texto de ejemplo; en el PDF salen los datos reales del proyecto.
        </p>
      </div>

      {/* Panel de propiedades del elemento seleccionado */}
      <div style={{ minWidth: 210 }}>
        {selected && sel !== null ? (
          <ElementProps
            el={selected}
            onPatch={(p) => patch(sel, p, true)}
            onCommit={() => onChange(elements, false)}
            onRemove={() => remove(sel)}
            onReplaceImage={async () => {
              const src = await onUploadImage();
              if (src) patch(sel, { src }, false);
            }}
          />
        ) : (
          <p className="faint" style={{ fontSize: 12 }}>
            Selecciona un elemento del lienzo para editar sus propiedades, o agrega uno con los
            botones de arriba.
          </p>
        )}
      </div>
    </div>
  );
}

function ElementProps({
  el,
  onPatch,
  onCommit,
  onRemove,
  onReplaceImage,
}: {
  el: CoverElement;
  onPatch: (p: Partial<CoverElement>) => void;
  onCommit: () => void;
  onRemove: () => void;
  onReplaceImage: () => Promise<void>;
}) {
  const isText = el.kind !== "logo" && el.kind !== "image";
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>{KIND_LABEL[el.kind]}</strong>
        <button className="btn small" onClick={onRemove} title="Quitar">
          <i className="ti ti-trash" />
        </button>
      </div>

      {el.kind === "text" && (
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Contenido</label>
          <textarea
            className="input"
            rows={2}
            value={el.content ?? ""}
            onChange={(e) => onPatch({ content: e.target.value })}
            onBlur={onCommit}
          />
        </div>
      )}

      {(el.kind === "logo" || el.kind === "image") && (
        <>
          {el.kind === "image" && (
            <button
              className="btn small"
              style={{ marginBottom: 8 }}
              onClick={() => void onReplaceImage()}
            >
              <i className="ti ti-upload" />
              Cambiar imagen
            </button>
          )}
          <div className="field">
            <label>Ancho: {Math.round(el.w * 100)}%</label>
            <input
              type="range"
              min={3}
              max={100}
              value={Math.round(el.w * 100)}
              onChange={(e) => onPatch({ w: Number(e.target.value) / 100 })}
              onMouseUp={onCommit}
            />
          </div>
        </>
      )}

      {isText && (
        <>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Tamano: {Math.round(el.font_size || 12)} pt</label>
            <input
              type="range"
              min={8}
              max={60}
              value={Math.round(el.font_size || 12)}
              onChange={(e) => onPatch({ font_size: Number(e.target.value) })}
              onMouseUp={onCommit}
            />
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                className={`btn small ${(el.align ?? "left") === a ? "primary" : ""}`}
                onClick={() => {
                  onPatch({ align: a });
                  onCommit();
                }}
              >
                <i className={`ti ti-align-${a === "left" ? "left" : a === "right" ? "right" : "center"}`} />
              </button>
            ))}
            <button
              className={`btn small ${el.weight === "bold" ? "primary" : ""}`}
              onClick={() => {
                onPatch({ weight: el.weight === "bold" ? "normal" : "bold" });
                onCommit();
              }}
            >
              <i className="ti ti-bold" />
            </button>
          </div>
          <div className="field">
            <label>Color</label>
            <input
              type="color"
              className="swatch"
              style={{ padding: 0, border: "none" }}
              value={el.color || "#1a1a1a"}
              onChange={(e) => onPatch({ color: e.target.value })}
              onBlur={onCommit}
            />
          </div>
        </>
      )}
    </div>
  );
}
