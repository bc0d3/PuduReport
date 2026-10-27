// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { FindingTemplate, PdfTemplate, ProjectMeta, Snippet } from "../lib/types";
import { typeInfo } from "../lib/projectTypes";
import { SeverityBadge } from "../components/Severity";
import { Modal } from "../components/Modal";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { errorMessage } from "../lib/exportFlow";

interface Props {
  projectId: string | null;
  /** Proyecto activo: define la plantilla por su tipo + override. */
  project: ProjectMeta | null;
  onProjectSaved: (meta: ProjectMeta) => void;
  /** Aviso de que cambiaron las plantillas (p.ej. su familia), para refrescar. */
  onTemplatesChanged?: () => void;
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

export function TemplateLibrary({
  projectId,
  project,
  onProjectSaved,
  onTemplatesChanged,
}: Readonly<Props>) {
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
  const [confirmDup, setConfirmDup] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

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
    const done = await guard(
      api.loadProject(projectId).then((current) =>
        api.saveProject(projectId, {
          ...current,
          template_override: name === typeTemplate ? "" : name,
        }),
      ),
      `Plantilla: ${name}`,
    );
    if (done) onProjectSaved(done);
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
                    {t.ai_generated && (
                      <span
                        className="tpl-badge-ai"
                        title="La creo o edito una IA via MCP. Revisa el codigo antes de usarla en un reporte real."
                      >
                        Generado por IA
                      </span>
                    )}
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
                      onClick={() => setConfirmDup(t.name)}
                    >
                      <i className="ti ti-copy" />
                    </button>
                    {!t.builtin && (
                      <button
                        className="btn small danger"
                        title="Eliminar de tu libreria"
                        onClick={() => setConfirmDel(t.name)}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    )}
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
      onTemplatesChanged?.();
      setEditing(newName);
    }
  }

  async function deleteTpl(name: string) {
    const done = await guard(
      api.deleteTemplate(name).then(() => true),
      "Plantilla eliminada",
    );
    if (!done) return;
    // Si el proyecto activo la usaba como override, lo limpiamos para no dejar
    // una referencia colgante que rompa la generacion del PDF.
    if (project && projectId && project.template_override === name) {
      const saved = await guard(
        api
          .loadProject(projectId)
          .then((current) => api.saveProject(projectId, { ...current, template_override: "" })),
      );
      if (saved) onProjectSaved(saved);
    }
    await reload();
    onTemplatesChanged?.();
  }

  const q = query.trim().toLowerCase();
  const filteredPdf = pdfTemplates.filter(
    (t) =>
      q === "" ||
      t.title.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  const builtinPdf = filteredPdf.filter((t) => t.builtin);
  const userPdf = filteredPdf.filter((t) => !t.builtin);
  const builtinFindings = templates.filter((t) => t.builtin);
  const userFindings = templates.filter((t) => !t.builtin);

  // Copia una plantilla incluida a la biblioteca del workspace para editarla;
  // el id vacio hace que save_finding_template genere uno nuevo a partir del
  // titulo (misma logica que para las plantillas PDF).
  async function duplicateFinding(t: FindingTemplate) {
    const copy: FindingTemplate = { ...t, id: "", builtin: false };
    const done = await guard(
      api.saveFindingTemplate(copy).then(() => true),
      "Plantilla duplicada a tu biblioteca",
    );
    if (done) await reload();
  }

  async function copySnippet(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      notify("Snippet copiado al portapapeles", "ok");
    } catch (error_) {
      notify(errorMessage(error_), "error");
    }
  }

  function findingCard(t: FindingTemplate) {
    return (
      <div className="card" key={`${t.id}-${t.builtin}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 10 }}>
            <SeverityBadge severity={t.meta.severity} />
            <strong>{t.meta.title}</strong>
            {t.meta.cwe.length > 0 && <span className="faint">{t.meta.cwe.join(", ")}</span>}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {t.builtin && (
              <button
                className="btn small"
                title="Duplicar a tu biblioteca para editarla"
                onClick={() => duplicateFinding(t)}
              >
                <i className="ti ti-copy" />
              </button>
            )}
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
      </div>
    );
  }

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="view">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="tabs">
          <button className={`tab ${tab === "pdf" ? "active" : ""}`} onClick={() => setTab("pdf")}>
            <i className="ti ti-layout-cards" aria-hidden="true" /> <span>Plantillas PDF</span>
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
          <ProjectTemplateNotice project={project} />
          <div className="field" style={{ maxWidth: 360, marginTop: 8, marginBottom: 8 }}>
            <input
              className="input"
              aria-label="Buscar plantillas PDF"
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
          {templates.length === 0 ? (
            <div className="empty">Sin plantillas de hallazgos.</div>
          ) : (
            <>
              <div className="tpl-section-head">
                <h3>Tu biblioteca</h3>
                <span className="faint">Plantillas que creaste o duplicaste en este workspace</span>
              </div>
              {userFindings.length === 0 ? (
                <div className="empty">
                  Aun no tienes plantillas propias. Duplica una incluida para personalizarla.
                </div>
              ) : (
                userFindings.map(findingCard)
              )}

              <div className="tpl-section-head" style={{ marginTop: 22 }}>
                <h3>Incluidas</h3>
                <span className="faint">
                  29 clases de vulnerabilidad frecuentes, listas para insertar
                </span>
              </div>
              {builtinFindings.map(findingCard)}
            </>
          )}
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
                    void copySnippet(s.body);
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
          template={
            pdfTemplates.find((t) => t.name === editing) ?? {
              name: editing,
              builtin: false,
              title: editing,
              description: "",
              tags: [],
              family: "findings",
            }
          }
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
            onTemplatesChanged?.();
          }}
        />
      )}

      {confirmDup && (
        <ConfirmDialog
          title="Duplicar plantilla"
          message={`Se creara una copia editable de "${confirmDup}" en tu libreria.`}
          confirmLabel="Duplicar"
          danger={false}
          onConfirm={() => duplicate(confirmDup)}
          onClose={() => setConfirmDup(null)}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Eliminar plantilla"
          message={`Se eliminara "${confirmDel}" de tu libreria. No afecta a las plantillas incluidas.`}
          onConfirm={() => deleteTpl(confirmDel)}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

function ProjectTemplateNotice({ project }: Readonly<{ project: ProjectMeta | null }>) {
  if (!project) {
    return (
      <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
        Selecciona un proyecto para asignarle una plantilla.
      </p>
    );
  }
  return (
    <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
      Plantilla de <strong>{project.name}</strong> (tipo {typeInfo(project.project_type).label}).
      {project.template_override
        ? " Usas un override manual; vuelve a la del tipo eligiendola de nuevo."
        : " Sigue la plantilla del tipo. Elige otra para cambiarla solo en este proyecto."}
    </p>
  );
}

/**
 * Editor de una plantilla propia. Lo simple primero: titulo, descripcion y tags
 * en un form; el codigo Typst queda en una seccion "Avanzado" plegable. El
 * comportamiento (orden y render) lo define un tag: "retest" o "narrative".
 */
function TemplateEditor({
  template,
  onClose,
  onSaved,
}: Readonly<{
  template: PdfTemplate;
  onClose: () => void;
  onSaved: () => Promise<void>;
}>) {
  const fieldId = useId();
  const { guard } = useToast();
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description);
  const [tagsInput, setTagsInput] = useState(template.tags.join(", "));
  const [source, setSource] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    let active = true;
    void guard(api.readTemplateSource(template.name)).then((source) => {
      if (active && source !== undefined) setSource(source);
    });
    return () => {
      active = false;
    };
  }, [guard, template.name]);

  async function save() {
    if (source === null) return;
    // La familia va explicita en el meta; los tags quedan descriptivos.
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const metaDone = await guard(
      api.saveTemplateMeta(template.name, title, description, tags).then(() => true),
    );
    if (!metaDone) return;
    const srcDone = await guard(
      api.saveTemplateSource(template.name, source).then(() => true),
      "Plantilla guardada",
    );
    if (srcDone) await guard(onSaved());
  }

  return (
    <Modal
      title={`Editar plantilla: ${template.name}`}
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
      <div className="field">
        <label htmlFor={`${fieldId}-title`}>Titulo</label>
        <input
          id={`${fieldId}-title`}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${fieldId}-description`}>Descripcion</label>
        <input
          id={`${fieldId}-description`}
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${fieldId}-tags`}>Tags (separados por coma)</label>
        <input
          id={`${fieldId}-tags`}
          className="input"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="web, infra, remediacion"
        />
        <span className="faint" style={{ fontSize: 12 }}>
          Para buscar y filtrar. Dos cambian el reporte: <strong>retest</strong> (ordena por estado
          y separa los nuevos) y <strong>narrative</strong> (sin tabla de hallazgos).
        </span>
      </div>

      <button className="btn small" style={{ marginTop: 4 }} onClick={() => setShowCode((v) => !v)}>
        <i className={`ti ti-chevron-${showCode ? "down" : "right"}`} aria-hidden="true" />{" "}
        <span>Avanzado: codigo Typst</span>
      </button>
      {showCode && (
        <>
          <p className="faint" style={{ fontSize: 12, marginBottom: 4 }}>
            Codigo Typst. Se guarda en tu libreria. Consume el mismo data.json.
          </p>
          <textarea
            aria-label="Codigo Typst"
            className="textarea mono"
            style={{ width: "100%", minHeight: 320, fontSize: 12 }}
            value={source ?? "Cargando..."}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
          />
        </>
      )}
    </Modal>
  );
}

function InstantiateModal({
  template,
  onClose,
  onSubmit,
}: Readonly<{
  template: FindingTemplate;
  onClose: () => void;
  onSubmit: (vars: Record<string, string>) => Promise<void>;
}>) {
  const fieldId = useId();
  const { guard } = useToast();
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
          <button
            className="btn primary"
            onClick={() => {
              void guard(onSubmit(values));
            }}
          >
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
            <label htmlFor={`${fieldId}-${v}`}>{`{{${v}}}`}</label>
            <input
              id={`${fieldId}-${v}`}
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

function TemplateForm({
  onClose,
  onSaved,
}: Readonly<{ onClose: () => void; onSaved: () => Promise<void> }>) {
  const fieldId = useId();
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
      builtin: false,
    };
    const done = await guard(
      api.saveFindingTemplate(template).then(() => true),
      "Plantilla guardada",
    );
    if (done) await guard(onSaved());
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
        <label htmlFor={`${fieldId}-title`}>Titulo (admite variables como {`{{cliente}}`})</label>
        <input
          id={`${fieldId}-title`}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${fieldId}-cwe`}>CWE</label>
        <input
          id={`${fieldId}-cwe`}
          className="input"
          value={cwe}
          onChange={(e) => setCwe(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="field-label" id={`${fieldId}-body`}>
          Cuerpo
        </span>
        <MarkdownEditor labelledBy={`${fieldId}-body`} value={body} onChange={setBody} />
      </div>
    </Modal>
  );
}

function SnippetForm({
  onClose,
  onSaved,
}: Readonly<{ onClose: () => void; onSaved: () => Promise<void> }>) {
  const fieldId = useId();
  const { guard } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function save() {
    if (!title.trim()) return;
    const done = await guard(
      api.saveSnippet({ id: "", title, body }).then(() => true),
      "Snippet guardado",
    );
    if (done) await guard(onSaved());
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
        <label htmlFor={`${fieldId}-title`}>Titulo</label>
        <input
          id={`${fieldId}-title`}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="field-label" id={`${fieldId}-body`}>
          Contenido
        </span>
        <MarkdownEditor
          labelledBy={`${fieldId}-body`}
          value={body}
          onChange={setBody}
          placeholder="Texto reutilizable, listas o comandos. Puedes usar variables como {{cliente}}."
        />
      </div>
    </Modal>
  );
}
