// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useState } from "react";
import type { CvssResult, CvssVersion } from "../lib/types";
import { buildVector, defaultSelections, groupsFor, parseVector } from "../lib/cvssMetrics";
import * as api from "../lib/api";
import { SeverityBadge } from "./Severity";
import { useToast } from "./Toast";

interface Props {
  version: CvssVersion;
  initialVector: string;
  onApply: (result: CvssResult) => void;
  onClose: () => void;
}

/** Popover con la calculadora CVSS 3.1 / 4.0. Deriva puntaje y severidad. */
export function CvssCalculator({ version, initialVector, onApply, onClose }: Props) {
  const { notify } = useToast();
  const [ver, setVer] = useState<CvssVersion>(version);
  const [sel, setSel] = useState<Record<string, string>>(() =>
    initialVector ? parseVector(version, initialVector) : defaultSelections(version),
  );
  const [result, setResult] = useState<CvssResult | null>(null);

  // Recalcula al cambiar cualquier metrica o version.
  useEffect(() => {
    let cancelled = false;
    const vector = buildVector(ver, sel);
    api
      .calcCvss(ver, vector)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => notify(String(err), "error"));
    return () => {
      cancelled = true;
    };
  }, [ver, sel, notify]);

  function changeVersion(next: CvssVersion) {
    setVer(next);
    setSel(defaultSelections(next));
  }

  function setMetric(key: string, value: string) {
    setSel((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>Calculadora CVSS</h3>
          <div className="tabs">
            <button
              className={`tab ${ver === "3.1" ? "active" : ""}`}
              onClick={() => changeVersion("3.1")}
            >
              3.1
            </button>
            <button
              className={`tab ${ver === "4.0" ? "active" : ""}`}
              onClick={() => changeVersion("4.0")}
            >
              4.0
            </button>
          </div>
        </div>

        {result && (
          <div className="cvss-result">
            <span className="score">{result.score.toFixed(1)}</span>
            <SeverityBadge severity={result.severity} />
            <span className="faint" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
              {result.vector}
            </span>
          </div>
        )}

        {groupsFor(ver).map((group) => (
          <div className="metric-group" key={group.title}>
            <h4>{group.title}</h4>
            {group.metrics.map((metric) => (
              <div className="metric" key={metric.key}>
                <div className="metric-label">{metric.name}</div>
                <div className="metric-options">
                  {metric.options.map((opt) => (
                    <button
                      key={opt.value}
                      className={`metric-opt ${sel[metric.key] === opt.value ? "selected" : ""}`}
                      onClick={() => setMetric(metric.key, opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!result}
            onClick={() => {
              if (result) onApply(result);
            }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
