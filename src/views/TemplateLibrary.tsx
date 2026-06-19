import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { FindingTemplate, PdfTemplate, ProjectMeta, Snippet } from "../lib/types";
import { typeInfo } from "../lib/projectTypes";
import { SeverityBadge } from "../components/Severity";
import { Modal } from "../components/Modal";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useToast } from "../components/Toast";

interface Props {
  projectId: string | null;
  /** Proyecto activo: define la plantilla por su tipo + override. */
  project: ProjectMeta | null;
  onProjectSaved: (meta: ProjectMeta) => void;
}

type Tab = "pdf" | "findings" | "snippets";

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

export function TemplateLibrary({ projectId, project, onProjectSaved }: Props) {
  const { guard, notify } = useToast();
  const [tab, setTab] = useState<Tab>("pdf");
  const [templates, setTemplates] = useState<FindingTemplate[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [instantiating, setInstantiating] = useState<FindingTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [creatingSnippet, setCreatingSnippet] = useState(false);

  // Plantilla del tipo del proyecto y la efectiva (override si existe).
  const typeTemplate = project ? typeInfo(project.project_type).template : "";
  const effectiveTemplate = project ? project.template_override || typeTemplate : "";

  const reload = useCallback(async () => {
    const [t, s, p] = await Promise.all([
      guard(api.listFindingTemplates()),
      guard(api.listSnippets()),
      guard(api.listPdfTemplates()),
    ]);
    if (t) setTemplates(t);
    if (s) setSnippets(s);
    if (p) setPdfTemplates(p);
  }, [guard]);

  // Fija la plantilla del proyecto. Si coincide con la del tipo, limpia el
  // override para que el proyecto siga al tipo; si no, guarda el override.
  async function applyTemplate(name: string) {
    if (!projectId || !project) return;
    const next: ProjectMeta = {
      ...project,
      template_override: name === typeTemplate ? "" : name,
    };
    const done = await guard(api.saveProject(projectId, next), `Plantilla: ${name}`);
    if (done !== undefined) onProjectSaved(next);
  }

  // Tabla de plantillas PDF (se reutiliza para las incluidas y las del usuario).
  function pdfTable(rows: PdfTemplate[]) {
    return (
      <table className="tpl-table">
        <thead>
          <tr>
            <th>Plantilla</th>
            <th>Descripcion</th>
            <th className="ta-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const active = effectiveTemplate === t.name;
            return (
              <tr key={`${t.name}-${t.builtin}`} className={active ? "tpl-row-active" : ""}>
                <td>
                  <div className="tpl-name">
                    <i className="ti ti-file-type-pdf" />
                    <span className="tpl-title">{t.title || t.name}</span>
                    {active && <span className="tpl-badge">Activa</span>}
                  </div>
                  <span className="tpl-id">{t.name}</span>
                </td>
                <td className="tpl-desc">{t.description || "Plantilla de PDF."}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    {!t.builtin && (
                      <button
                        className="btn small"
                        title="Editar"
                        onClick={() => setEditing(t.name)}
                      >
                        <i className="ti ti-pencil" />
                      </button>
                    )}
                    <button
                      className="btn small"
                      title="Duplicar"
                      onClick={() => duplicate(t.name)}
                    >
                      <i className="ti ti-copy" />
                    </button>
                    <button
                      className={`btn small ${active ? "" : "primary"}`}
                      disabled={active}
                      onClick={() => applyTemplate(t.name)}
                    >
                      {active ? "En uso" : "Usar"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  async function duplicate(name: string) {
    const newName = await guard(api.duplicateTemplate(name), "Plantilla duplicada");
    if (newName) {
      await reload();
      setEditing(newName);
    }
  }

  const q = query.trim().toLowerCase();
  const filteredPdf = pdfTemplates.filter(
    (t) =>
      q === "" ||
      t.title.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );
  const builtinPdf = filteredPdf.filter((t) => t.builtin);
  const userPdf = filteredPdf.filter((t) => !t.builtin);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="tabs">
          <button className={`tab ${tab === "pdf" ? "active" : ""}`} onClick={() => setTab("pdf")}>
            <i className="ti ti-layout-cards" />
            Plantillas PDF
          </button>
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
        {tab === "findings" && (
          <button className="btn primary" onClick={() => setCreatingTemplate(true)}>
            Nueva plantilla
          </button>
        )}
        {tab === "snippets" && (
          <button className="btn primary" onClick={() => setCreatingSnippet(true)}>
            Nuevo snippet
          </button>
        )}
      </div>

      {tab === "pdf" && (
        <>
          {project ? (
            <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
              Plantilla de <strong>{project.name}</strong> (tipo{" "}
              {typeInfo(project.project_type).label}).
              {project.template_override
                ? " Usas un override manual; vuelve a la del tipo eligiendola de nuevo."
                : " Sigue la plantilla del tipo. Elige otra para cambiarla solo en este proyecto."}
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
              Selecciona un proyecto para asignarle una plantilla.
            </p>
          )}
          <div className="field" style={{ maxWidth: 360, marginTop: 8, marginBottom: 8 }}>
            <input
              className="input"
              placeholder="Buscar por nombre o descripcion..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {filteredPdf.length === 0 ? (
            <div className="empty">No hay plantillas que coincidan.</div>
          ) : (
            <>
              <div className="tpl-section-head">
                <h3>Tu libreria</h3>
                <span className="faint">Plantillas que duplicaste o creaste en este workspace</span>
              </div>
              {userPdf.length === 0 ? (
                <div className="empty">
                  Aun no tienes plantillas propias. Duplica una incluida para personalizarla.
                </div>
              ) : (
                pdfTable(userPdf)
              )}

              <div className="tpl-section-head" style={{ marginTop: 22 }}>
                <h3>Incluidas</h3>
                <span className="faint">Vienen en el compilado de PuduReport</span>
              </div>
              {builtinPdf.length === 0 ? (
                <div className="empty">Ninguna incluida coincide con la busqueda.</div>
              ) : (
                pdfTable(builtinPdf)
              )}
            </>
          )}
        </>
      )}

      {tab === "findings" && (
        <>
          {templates.length === 0 && <div className="empty">Sin plantillas de hallazgos.</div>}
          {templates.map((t) => (
            <div className="card" key={t.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="row" style={{ gap: 10 }}>
                  <SeverityBadge severity={t.meta.severity} />
                  <strong>{t.meta.title}</strong>
                  {t.meta.cwe.length > 0 && (
                    <span className="faint">{t.meta.cwe.join(", ")}</span>
                  )}
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

      {editing && (
        <TemplateEditor
          name={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** Editor del codigo fuente .typ de una plantilla (nivel avanzado). */
function TemplateEditor({
  name,
  onClose,
  onSaved,
}: {
  name: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { guard } = useToast();
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    guard(api.readTemplateSource(name)).then((s) => setSource(s ?? ""));
  }, [guard, name]);

  async function save() {
    if (source === null) return;
    const done = await guard(api.saveTemplateSource(name, source), "Plantilla guardada");
    if (done !== undefined) onSaved();
  }

  return (
    <Modal
      title={`Editar plantilla: ${name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={source === null}>
            Guardar
          </button>
        </>
      }
    >
      <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>
        Codigo Typst. Se guarda en tu libreria. Consume el mismo data.json.
      </p>
      <textarea
        className="textarea mono"
        style={{ width: "100%", minHeight: 360, fontSize: 12 }}
        value={source ?? "Cargando..."}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
      />
    </Modal>
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
        cwe: cwe.trim() ? [cwe.trim()] : [],
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
        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
        />
      </div>
    </Modal>
  );
}
