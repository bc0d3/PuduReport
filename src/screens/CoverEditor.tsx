import { useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../lib/api";
import type { WorkspaceMeta } from "../lib/types";
import { BODY_FONT_SUGGESTIONS, MONO_FONT_SUGGESTIONS } from "../lib/fonts";
import { useToast } from "../components/Toast";

interface Props {
  workspace: WorkspaceMeta;
  workspacePath: string | null;
  onWorkspaceSaved: (meta: WorkspaceMeta) => void;
}

const LAYOUTS: { value: WorkspaceMeta["branding"]["cover_layout"]; label: string; icon: string }[] =
  [
    { value: "centered", label: "Centrada", icon: "ti-layout-align-center" },
    { value: "sidebar", label: "Lateral", icon: "ti-layout-sidebar" },
    { value: "full-bleed", label: "Completa", icon: "ti-layout-board" },
    { value: "minimal", label: "Minimal", icon: "ti-layout-bottombar" },
  ];

const SWATCHES = ["#1f6fb2", "#0f6e56", "#993c1d", "#2c2c2a"];

function extFromFile(file: File): string {
  const fromName = file.name.includes(".") ? (file.name.split(".").pop() ?? "") : "";
  return fromName || file.type.split("/")[1] || "png";
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Resuelve una ruta de branding (root-relative) a una URL cargable por la webview. */
function resolveBrandingSrc(path: string, workspacePath: string | null): string {
  if (!path || !workspacePath) return "";
  try {
    return convertFileSrc(`${workspacePath}${path}`);
  } catch {
    return "";
  }
}

export function CoverEditor({ workspace, workspacePath, onWorkspaceSaved }: Props) {
  const { guard } = useToast();
  const saveTimer = useRef<number | undefined>(undefined);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const bgInput = useRef<HTMLInputElement | null>(null);

  // Cambios discretos (layout, color, toggles) se guardan al instante para que
  // apliquen de inmediato; los continuos (sliders, texto) van con debounce.
  const save = useCallback(
    (next: WorkspaceMeta, debounced = false) => {
      onWorkspaceSaved(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (debounced) {
        saveTimer.current = window.setTimeout(() => guard(api.saveWorkspaceMeta(next)), 250);
      } else {
        guard(api.saveWorkspaceMeta(next));
      }
    },
    [guard, onWorkspaceSaved],
  );

  async function upload(file: File, target: "logo_path" | "cover_background") {
    const base64 = await readBase64(file);
    const rel = await guard(api.saveBrandingAsset(extFromFile(file), base64));
    if (rel) save({ ...workspace, branding: { ...workspace.branding, [target]: rel } });
  }

  const brand = workspace.branding.primary_color || "#1f6fb2";
  const logoSrc = resolveBrandingSrc(workspace.branding.logo_path, workspacePath);
  const bgSrc = resolveBrandingSrc(workspace.branding.cover_background, workspacePath);

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Portada y marca</h1>
          <p className="sub">Logo, colores y marca de agua. Se aplican a todos los reportes.</p>
        </div>
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "290px minmax(0,1fr)", gap: 22 }}>
          <div>
            <span className="field-label-top">disposicion</span>
            <div className="cardsel-grid" style={{ marginBottom: 18 }}>
              {LAYOUTS.map((l) => (
                <div
                  key={l.value}
                  className={`cardsel ${workspace.branding.cover_layout === l.value ? "sel" : ""}`}
                  onClick={() =>
                    save({
                      ...workspace,
                      branding: { ...workspace.branding, cover_layout: l.value },
                    })
                  }
                >
                  <i className={`ti ${l.icon}`} />
                  {l.label}
                </div>
              ))}
            </div>

            {/* Logo (upload) */}
            <span className="field-label-top">logo</span>
            <div className="upload-row" style={{ marginBottom: 14 }}>
              {logoSrc ? (
                <img className="brand-thumb" src={logoSrc} alt="logo" />
              ) : (
                <div className="brand-thumb empty">
                  <i className="ti ti-photo" />
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                <button className="btn small" onClick={() => logoInput.current?.click()}>
                  <i className="ti ti-upload" />
                  Subir
                </button>
                {workspace.branding.logo_path && (
                  <button
                    className="btn small"
                    onClick={() =>
                      save({ ...workspace, branding: { ...workspace.branding, logo_path: "" } })
                    }
                  >
                    Quitar
                  </button>
                )}
              </div>
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f, "logo_path");
                  e.target.value = "";
                }}
              />
            </div>

            {/* Fondo de portada (upload, separado del logo) */}
            <span className="field-label-top">imagen de fondo de portada</span>
            <div className="upload-row" style={{ marginBottom: 14 }}>
              {bgSrc ? (
                <img className="brand-thumb" src={bgSrc} alt="fondo" />
              ) : (
                <div className="brand-thumb empty">
                  <i className="ti ti-photo" />
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                <button className="btn small" onClick={() => bgInput.current?.click()}>
                  <i className="ti ti-upload" />
                  Subir
                </button>
                {workspace.branding.cover_background && (
                  <button
                    className="btn small"
                    onClick={() =>
                      save({
                        ...workspace,
                        branding: { ...workspace.branding, cover_background: "" },
                      })
                    }
                  >
                    Quitar
                  </button>
                )}
              </div>
              <input
                ref={bgInput}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f, "cover_background");
                  e.target.value = "";
                }}
              />
            </div>

            {workspace.branding.cover_background && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Oscurecer fondo: {Math.round(workspace.branding.cover_scrim * 100)}%</label>
                <input
                  type="range"
                  min={0}
                  max={85}
                  step={5}
                  value={Math.round(workspace.branding.cover_scrim * 100)}
                  onChange={(e) =>
                    save(
                      {
                        ...workspace,
                        branding: {
                          ...workspace.branding,
                          cover_scrim: Number(e.target.value) / 100,
                        },
                      },
                      true,
                    )
                  }
                />
              </div>
            )}

            <span className="field-label-top">color de marca</span>
            <div className="swatch-row" style={{ marginBottom: 16 }}>
              {SWATCHES.map((c) => (
                <span
                  key={c}
                  className={`swatch ${brand.toLowerCase() === c ? "sel" : ""}`}
                  style={{ background: c }}
                  onClick={() =>
                    save({ ...workspace, branding: { ...workspace.branding, primary_color: c } })
                  }
                />
              ))}
              <input
                type="color"
                className="swatch"
                style={{ padding: 0, border: "none" }}
                value={brand}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, primary_color: e.target.value },
                  })
                }
              />
            </div>

            <span className="field-label-top">tipografia</span>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Fuente del cuerpo</label>
              <input
                className="input"
                list="body-fonts"
                placeholder="Por defecto (Helvetica Neue / Arial)"
                value={workspace.branding.body_font}
                onChange={(e) =>
                  save(
                    { ...workspace, branding: { ...workspace.branding, body_font: e.target.value } },
                    true,
                  )
                }
              />
              <datalist id="body-fonts">
                {BODY_FONT_SUGGESTIONS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>Fuente del codigo</label>
              <input
                className="input"
                list="mono-fonts"
                placeholder="Por defecto (JetBrains Mono / mono del sistema)"
                value={workspace.branding.mono_font}
                onChange={(e) =>
                  save(
                    { ...workspace, branding: { ...workspace.branding, mono_font: e.target.value } },
                    true,
                  )
                }
              />
              <datalist id="mono-fonts">
                {MONO_FONT_SUGGESTIONS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <p className="faint" style={{ fontSize: 12, margin: "6px 0 16px" }}>
              La fuente debe estar instalada en tu equipo; si no, el PDF usa una del sistema.
            </p>

            {/* Elementos de la portada: mostrar/ocultar y subtitulo libre */}
            <span className="field-label-top">elementos de portada</span>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Subtitulo</label>
              <input
                className="input"
                placeholder="Opcional (ej. Reporte de penetration testing)"
                value={workspace.branding.cover_subtitle}
                onChange={(e) =>
                  save(
                    {
                      ...workspace,
                      branding: { ...workspace.branding, cover_subtitle: e.target.value },
                    },
                    true,
                  )
                }
              />
            </div>
            <label className="row" style={{ gap: 8, cursor: "pointer", marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={workspace.branding.cover_show_logo}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, cover_show_logo: e.target.checked },
                  })
                }
              />
              Mostrar logo
            </label>
            <label className="row" style={{ gap: 8, cursor: "pointer", marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={workspace.branding.cover_show_period}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, cover_show_period: e.target.checked },
                  })
                }
              />
              Mostrar periodo (fechas)
            </label>
            <label className="row" style={{ gap: 8, cursor: "pointer", marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={workspace.branding.cover_show_org}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, cover_show_org: e.target.checked },
                  })
                }
              />
              Mostrar gerencia/area
            </label>
            <label
              className="row"
              style={{ gap: 8, cursor: "pointer", marginBottom: 16 }}
            >
              <input
                type="checkbox"
                checked={workspace.branding.cover_show_accent}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, cover_show_accent: e.target.checked },
                  })
                }
              />
              Mostrar linea de acento
            </label>

            {/* Marca de agua: on/off, texto, tamano, opacidad */}
            <span className="field-label-top">marca de agua</span>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <button
                className={`toggle ${workspace.watermark.enabled ? "" : "off"}`}
                onClick={() =>
                  save({
                    ...workspace,
                    watermark: { ...workspace.watermark, enabled: !workspace.watermark.enabled },
                  })
                }
              >
                <i className={`ti ${workspace.watermark.enabled ? "ti-eye" : "ti-eye-off"}`} />
              </button>
              <input
                className="input mono"
                style={{ flex: 1 }}
                value={workspace.watermark.text}
                disabled={!workspace.watermark.enabled}
                onChange={(e) =>
                  save(
                    { ...workspace, watermark: { ...workspace.watermark, text: e.target.value } },
                    true,
                  )
                }
              />
            </div>
            <div className="field" style={{ marginBottom: 6 }}>
              <label>Tamano: {Math.round(workspace.watermark.size)} pt</label>
              <input
                type="range"
                min={24}
                max={140}
                step={2}
                disabled={!workspace.watermark.enabled}
                value={workspace.watermark.size}
                onChange={(e) =>
                  save(
                    {
                      ...workspace,
                      watermark: { ...workspace.watermark, size: Number(e.target.value) },
                    },
                    true,
                  )
                }
              />
            </div>
            <div className="field">
              <label>Opacidad: {Math.round(workspace.watermark.opacity * 100)}%</label>
              <input
                type="range"
                min={2}
                max={30}
                step={1}
                disabled={!workspace.watermark.enabled}
                value={Math.round(workspace.watermark.opacity * 100)}
                onChange={(e) =>
                  save(
                    {
                      ...workspace,
                      watermark: { ...workspace.watermark, opacity: Number(e.target.value) / 100 },
                    },
                    true,
                  )
                }
              />
            </div>

            {/* Opciones de los hallazgos */}
            <span className="field-label-top" style={{ marginTop: 16 }}>
              hallazgos
            </span>
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={workspace.branding.findings_page_break}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, findings_page_break: e.target.checked },
                  })
                }
              />
              Cada hallazgo en su propia hoja
            </label>
          </div>

          {/* Vista en miniatura de la portada */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CoverPreview workspace={workspace} brand={brand} logoSrc={logoSrc} bgSrc={bgSrc} />
          </div>
        </div>
      </div>
    </>
  );
}

function CoverPreview({
  workspace,
  brand,
  logoSrc,
  bgSrc,
}: {
  workspace: WorkspaceMeta;
  brand: string;
  logoSrc: string;
  bgSrc: string;
}) {
  const b = workspace.branding;
  const layout = workspace.branding.cover_layout;
  const wm = workspace.watermark;
  const hasBg = Boolean(bgSrc);
  const full = layout === "full-bleed";
  const left = layout === "sidebar" || layout === "minimal";
  return (
    <div
      style={{
        width: 320,
        height: 420,
        background: full && !hasBg ? brand : "#ffffff",
        border: "1px solid var(--border-strong)",
        borderRadius: 4,
        overflow: "hidden",
        position: "relative",
        color: "#1a1a1a",
      }}
    >
      {hasBg && (
        <img
          src={bgSrc}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {/* Scrim para legibilidad cuando hay imagen de fondo en full-bleed */}
      {hasBg && full && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(0,0,0,${workspace.branding.cover_scrim})`,
          }}
        />
      )}
      {/* Barra superior solo en "centrada" */}
      {!hasBg && layout === "centered" && <div style={{ height: 8, background: brand }} />}
      <div
        style={{
          position: "relative",
          padding: layout === "sidebar" ? "34px 28px 34px 40px" : "34px 28px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: left ? "flex-start" : "center",
          textAlign: left ? "left" : "center",
          justifyContent: "center",
          color: full ? "#ffffff" : "#1a1a1a",
        }}
      >
        {layout === "sidebar" && !hasBg && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 6,
              background: brand,
            }}
          />
        )}
        {b.cover_show_logo &&
          (logoSrc ? (
            <img
              src={logoSrc}
              alt="logo"
              style={{ maxWidth: 90, maxHeight: 70, marginBottom: 24 }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                background: brand + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: brand,
                marginBottom: 28,
              }}
            >
              <i className="ti ti-shield-lock" style={{ fontSize: 26 }} />
            </div>
          ))}
        <div style={{ fontSize: 18, fontWeight: 600 }}>Pentest Aplicacion Web</div>
        <div style={{ fontSize: 13, color: full ? "#e6edf3" : brand, marginTop: 6 }}>
          Cliente Demo S.A.
        </div>
        {b.cover_subtitle && (
          <div style={{ fontSize: 12, color: full ? "#e6edf3" : brand, marginTop: 4 }}>
            {b.cover_subtitle}
          </div>
        )}
        {b.cover_show_accent && (
          <div style={{ width: 40, height: 2, background: brand, margin: "14px 0" }} />
        )}
        {b.cover_show_period && (
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              marginTop: b.cover_show_accent ? 0 : 14,
            }}
          >
            01/01/2026 — 15/01/2026
          </div>
        )}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>{workspace.name}</div>
      </div>
      {wm.enabled && wm.text && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              transform: "rotate(-45deg)",
              whiteSpace: "nowrap",
              fontSize: wm.size * 0.5,
              fontWeight: 700,
              color: `rgba(120,120,120,${wm.opacity})`,
            }}
          >
            {wm.text}
          </span>
        </div>
      )}
    </div>
  );
}
