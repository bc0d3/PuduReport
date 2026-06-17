import { useState } from "react";
import type { Finding } from "../lib/types";
import { SeverityDot } from "./Severity";

interface Props {
  findings: Finding[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

/** Lista lateral de hallazgos con punto de severidad y reordenamiento drag & drop. */
export function Sidebar({ findings, activeId, onSelect, onCreate, onReorder }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  function submitNew() {
    const title = newTitle.trim();
    if (title) {
      onCreate(title);
      setNewTitle("");
    }
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = findings.map((f) => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    onReorder(ids);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="inline-form">
          <input
            className="input"
            placeholder="Nuevo hallazgo..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            style={{ flex: 1 }}
          />
          <button
            className="btn primary small"
            onClick={submitNew}
            disabled={!newTitle.trim()}
            title="Agregar hallazgo"
          >
            <i className="ti ti-plus" />
          </button>
        </div>
      </div>
      <div className="finding-list">
        {findings.length === 0 && <div className="empty">Sin hallazgos todavia.</div>}
        {findings.map((f) => (
          <div
            key={f.id}
            className={`finding-item ${f.id === activeId ? "active" : ""} ${
              f.id === dragId ? "dragging" : ""
            }`}
            onClick={() => onSelect(f.id)}
            draggable
            onDragStart={() => setDragId(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(f.id)}
          >
            <i className="ti ti-grip-vertical grip" />
            <SeverityDot severity={f.meta.severity} />
            <span className="title">{f.meta.title || "(sin titulo)"}</span>
            {f.meta.cvss && <span className="cvss-chip">{f.meta.cvss}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
