import { useCallback, useRef } from "react";
import * as api from "../lib/api";
import type { WorkspaceMeta } from "../lib/types";
import { useToast } from "../components/Toast";

interface Props {
  workspace: WorkspaceMeta;
  onWorkspaceSaved: (meta: WorkspaceMeta) => void;
}

const LAYOUTS: { value: WorkspaceMeta["branding"]["cover_layout"]; label: string; icon: string }[] = [
  { value: "centered", label: "Centrada", icon: "ti-layout-align-center" },
  { value: "sidebar", label: "Lateral", icon: "ti-layout-sidebar" },
  { value: "full-bleed", label: "Completa", icon: "ti-layout-board" },
  { value: "minimal", label: "Minimal", icon: "ti-layout-bottombar" },
];

const SWATCHES = ["#1f6fb2", "#0f6e56", "#993c1d", "#2c2c2a"];

export function CoverEditor({ workspace, onWorkspaceSaved }: Props) {
  const { guard } = useToast();
  const saveTimer = useRef<number | undefined>(undefined);

  const save = useCallback(
    (next: WorkspaceMeta) => {
      onWorkspaceSaved(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => guard(api.saveWorkspaceMeta(next)), 400);
    },
    [guard, onWorkspaceSaved],
  );

  const brand = workspace.branding.primary_color || "#1f6fb2";

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Portada y marca</h1>
          <p className="sub">Plantilla: {workspace.active_template}</p>
        </div>
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "270px minmax(0,1fr)", gap: 22 }}>
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

            <div className="field">
              <label>Logo (ruta relativa al workspace)</label>
              <input
                className="input mono"
                placeholder="assets/logo.png"
                value={workspace.branding.logo_path}
                onChange={(e) =>
                  save({
                    ...workspace,
                    branding: { ...workspace.branding, logo_path: e.target.value },
                  })
                }
              />
            </div>

            <span className="field-label-top">color de marca</span>
            <div className="swatch-row" style={{ marginBottom: 12 }}>
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

            <span className="field-label-top">marca de agua</span>
            <div className="row" style={{ gap: 8 }}>
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
                  save({
                    ...workspace,
                    watermark: { ...workspace.watermark, text: e.target.value },
                  })
                }
              />
            </div>
          </div>

          {/* Vista en miniatura de la portada */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CoverPreview workspace={workspace} brand={brand} />
          </div>
        </div>
      </div>
    </>
  );
}

function CoverPreview({ workspace, brand }: { workspace: WorkspaceMeta; brand: string }) {
  const layout = workspace.branding.cover_layout;
  const wm = workspace.watermark;
  return (
    <div
      style={{
        width: 320,
        height: 420,
        background: "#ffffff",
        border: "1px solid var(--border-strong)",
        borderRadius: 4,
        overflow: "hidden",
        position: "relative",
        color: "#1a1a1a",
      }}
    >
      {layout !== "minimal" && <div style={{ height: 8, background: brand }} />}
      <div
        style={{
          padding: layout === "sidebar" ? "34px 28px 34px 40px" : "34px 28px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: layout === "minimal" || layout === "sidebar" ? "flex-start" : "center",
          textAlign: layout === "minimal" || layout === "sidebar" ? "left" : "center",
          justifyContent: "center",
        }}
      >
        {layout === "sidebar" && (
          <div
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: brand }}
          />
        )}
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
        <div style={{ fontSize: 18, fontWeight: 600 }}>Pentest Aplicacion Web</div>
        <div style={{ fontSize: 13, color: brand, marginTop: 6 }}>Cliente Demo S.A.</div>
        <div style={{ width: 40, height: 2, background: brand, margin: "14px 0" }} />
        <div style={{ fontSize: 11, color: "#666" }}>{workspace.name}</div>
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
              fontSize: 42,
              fontWeight: 700,
              color: "rgba(0,0,0,.06)",
            }}
          >
            {wm.text}
          </span>
        </div>
      )}
    </div>
  );
}
