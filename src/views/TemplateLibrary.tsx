import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { FindingTemplate, Snippet } from "../lib/types";
import { SeverityBadge } from "../components/Severity";
import { Modal } from "../components/Modal";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useToast } from "../components/Toast";

interface Props {
  projectId: string | null;
}

type Tab = "findings" | "snippets";

/** Extrae los nombres de variables {{var}} de un texto. */
function extractVars(...texts: string[]): string[] {
  const re = /\{\{\s*([\w-]+)\s*\}\}/g;
  const found = new Set<string>();
  for (const text of texts) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      found.add(match[1]);
    }
  }
  return [...found];
}

export function TemplateLibrary({ projectId }: Props) {
  const { guard, notify } = useToast();
  const [tab, setTab] = useState<Tab>("findings");
  const [templates, setTemplates] = useState<FindingTemplate[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [instantiating, setInstantiating] = useState<FindingTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [creatingSnippet, setCreatingSnippet] = useState(false);

  const reload = useCallback(async () => {
    const [t, s] = await Promise.all([
      guard(api.listFindingTemplates()),
      guard(api.listSnippets()),
    ]);
    if (t) setTemplates(t);
    if (s) setSnippets(s);
  }, [guard]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="tabs">
          <button
            className={`tab ${tab === "findings" ? "active" : ""}`}
            onClick={() => setTab("findings")}
          >
            Hallazgos reutilizables
          </button>
          <button
            className={`tab ${tab === "snippets" ? "active" : ""}`}
            onClick={() => setTab("snippets")}
          >
            Snippets
          </button>
        </div>
        {tab === "findings" ? (
          <button className="btn primary" onClick={() => setCreatingTemplate(true)}>
            Nueva plantilla
          </button>
        ) : (
          <button className="btn primary" onClick={() => setCreatingSnippet(true)}>
            Nuevo snippet
          </button>
        )}
      </div>

      {tab === "findings" && (
        <>
          {templates.length === 0 && <div className="empty">Sin plantillas de hallazgos.</div>}
          {templates.map((t) => (
            <div className="card" key={t.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="row" style={{ gap: 10 }}>
                  <SeverityBadge severity={t.meta.severity} />
                  <strong>{t.meta.title}</strong>
                  {t.meta.cwe && <span className="faint">{t.meta.cwe}</span>}
                </div>
                <button
                  className="btn small"
                  disabled={!projectId}
                  title={projectId ? "" : "Selecciona un proyecto primero"}
                  onClick={() => setInstantiating(t)}
                >
                  Insertar en proyecto
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "snippets" && (
        <>
          {snippets.length === 0 && <div className="empty">Sin snippets.</div>}
          {snippets.map((s) => (
            <div className="card" key={s.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{s.title}</strong>
                <button
                  className="btn small"
                  onClick={() => {
                    navigator.clipboard.writeText(s.body);
                    notify("Snippet copiado al portapapeles", "ok");
                  }}
                >
                  Copiar
                </button>
              </div>
              <p className="muted" style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </>
      )}

      {instantiating && projectId && (
        <InstantiateModal
          template={instantiating}
          onClose={() => setInstantiating(null)}
          onSubmit={async (vars) => {
            const created = await guard(
              api.instantiateTemplate(projectId, instantiating.id, vars),
              "Hallazgo insertado en el proyecto",
            );
            if (created) setInstantiating(null);
          }}
        />
      )}

      {creatingTemplate && (
        <TemplateForm
          onClose={() => setCreatingTemplate(false)}
          onSaved={async () => {
            setCreatingTemplate(false);
            await reload();
          }}
        />
      )}

      {creatingSnippet && (
        <SnippetForm
          onClose={() => setCreatingSnippet(false)}
          onSaved={async () => {
            setCreatingSnippet(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function InstantiateModal({
  template,
  onClose,
  onSubmit,
}: {
  template: FindingTemplate;
  onClose: () => void;
  onSubmit: (vars: Record<string, string>) => void;
}) {
  const vars = useMemo(() => extractVars(template.meta.title, template.body), [template]);
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <Modal
      title={`Insertar: ${template.meta.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => onSubmit(values)}>
            Insertar
          </button>
        </>
      }
    >
      {vars.length === 0 ? (
        <p className="muted">Esta plantilla no tiene variables. Se insertara tal cual.</p>
      ) : (
        vars.map((v) => (
          <div className="field" key={v}>
            <label>{`{{${v}}}`}</label>
            <input
              className="input"
              value={values[v] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
            />
          </div>
        ))
      )}
    </Modal>
  );
}

function TemplateForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { guard } = useToast();
  const [title, setTitle] = useState("");
  const [cwe, setCwe] = useState("");
  const [body, setBody] = useState(
    "## Descripcion\n\nEn {{target}} de {{cliente}}...\n\n## Impacto\n\n## Remediacion\n",
  );

  async function save() {
    if (!title.trim()) return;
    const template: FindingTemplate = {
      id: "",
      meta: {
        title,
        severity: "info",
        cvss_version: "3.1",
        cvss: "",
        cvss_vector: "",
        cwe,
        status: "open",
        affected: [],
      },
      body,
    };
    const done = await guard(api.saveFindingTemplate(template), "Plantilla guardada");
    if (done !== undefined) onSaved();
  }

  return (
    <Modal
      title="Nueva plantilla de hallazgo"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={!title.trim()}>
            Guardar
          </button>
        </>
      }
    >
      <div className="field">
        <label>Titulo (admite variables como {`{{cliente}}`})</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>CWE</label>
        <input className="input" value={cwe} onChange={(e) => setCwe(e.target.value)} />
      </div>
      <div className="field">
        <label>Cuerpo</label>
        <MarkdownEditor value={body} onChange={setBody} />
      </div>
    </Modal>
  );
}

function SnippetForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { guard } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function save() {
    if (!title.trim()) return;
    const done = await guard(api.saveSnippet({ id: "", title, body }), "Snippet guardado");
    if (done !== undefined) onSaved();
  }

  return (
    <Modal
      title="Nuevo snippet"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={!title.trim()}>
            Guardar
          </button>
        </>
      }
    >
      <div className="field">
        <label>Titulo</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Contenido</label>
        <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      </div>
    </Modal>
  );
}
