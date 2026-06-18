import { useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import go from "highlight.js/lib/languages/go";
import http from "highlight.js/lib/languages/http";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Markdown } from "tiptap-markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../lib/api";
import { PromptDialog } from "./PromptDialog";

// Resaltado de sintaxis para los bloques de codigo (se empaqueta, sin red).
const lowlight = createLowlight();
lowlight.register({
  bash,
  go,
  http,
  javascript,
  json,
  php,
  powershell,
  python,
  sql,
  typescript,
  xml,
  yaml,
});

// Lenguajes ofrecidos en el selector (valor = id de highlight.js, "" = texto plano).
const CODE_LANGS: { value: string; label: string }[] = [
  { value: "", label: "Texto plano" },
  { value: "bash", label: "Bash / shell" },
  { value: "http", label: "HTTP" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "php", label: "PHP" },
  { value: "powershell", label: "PowerShell" },
  { value: "go", label: "Go" },
  { value: "sql", label: "SQL" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "HTML / XML" },
  { value: "yaml", label: "YAML" },
];

interface Props {
  /** Contenido markdown inicial. El componente debe re-montarse (key) al cambiar de seccion. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Directorio absoluto del proyecto; habilita pegar/soltar evidencias. */
  assetBase?: string | null;
  /** Id del proyecto, requerido para guardar assets. */
  projectId?: string | null;
  /** Si abre en vista de codigo markdown (true) o renderizada (false, por defecto). */
  sourceFirst?: boolean;
}

/** Resuelve una ruta relativa de asset a una URL cargable por la webview. */
function resolveSrc(src: string, base?: string | null): string {
  if (!base || !src || /^(data:|https?:|asset:|blob:)/.test(src)) return src;
  try {
    return convertFileSrc(`${base}/${src}`);
  } catch {
    return src;
  }
}

/** Interpreta el alt como un ancho ("60%" o "60") y devuelve "NN%" o null. */
function parseWidth(alt: string): string | null {
  const m = alt.trim().match(/^(\d{1,3})%?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 100 ? `${n}%` : null;
}

/** Asegura que cada imagen quede como bloque aislado (linea propia con saltos
 * alrededor). Evita que un `![](..)` quede pegado al texto/encabezado siguiente. */
function normalizeImages(md: string): string {
  return md
    .replace(/(!\[[^\]]*\]\([^)]*\))/g, "\n\n$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extFromFile(file: File): string {
  const fromName = file.name.includes(".") ? (file.name.split(".").pop() ?? "") : "";
  if (fromName) return fromName;
  const fromType = file.type.split("/")[1] ?? "";
  return fromType || "bin";
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Editor markdown WYSIWYG (TipTap). El usuario nunca teclea sintaxis markdown.
 * Si recibe assetBase + projectId, permite pegar o soltar evidencias: las
 * imagenes se guardan en assets/ con nombre UUID y quedan como ![](assets/...).
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  assetBase,
  projectId,
  sourceFirst,
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  // Vista activa: "source" muestra el markdown crudo en un textarea; "rich" el
  // editor WYSIWYG renderizado. Se alterna desde la barra.
  const [mode, setMode] = useState<"source" | "rich">(sourceFirst ? "source" : "rich");
  const [source, setSource] = useState(value);

  async function insertFile(file: File) {
    if (!projectId) return;
    try {
      const base64 = await readBase64(file);
      const rel = await api.saveAsset(projectId, extFromFile(file), base64);
      const editor = editorRef.current;
      if (!editor) return;
      if (file.type.startsWith("image/")) {
        editor.chain().focus().setImage({ src: rel }).run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: file.name,
            marks: [{ type: "link", attrs: { href: rel } }],
          })
          .run();
      }
    } catch (err) {
      // No interrumpir la edicion si falla el guardado.
      console.error("No se pudo adjuntar el archivo:", err);
    }
  }

  const uploadEnabled = Boolean(assetBase && projectId);

  // Image que guarda la ruta relativa en el markdown y muestra via asset:.
  const AssetImage = Image.extend({
    renderHTML({ HTMLAttributes }) {
      const rel = String(HTMLAttributes.src ?? "");
      const width = parseWidth(String(HTMLAttributes.alt ?? ""));
      const attrs: Record<string, string> = { ...HTMLAttributes, src: resolveSrc(rel, assetBase) };
      if (width) attrs.style = `width:${width}`;
      return ["img", attrs];
    },
  });

  const editor = useEditor({
    extensions: [
      // codeBlock del StarterKit se reemplaza por la version con resaltado.
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Escribe aqui..." }),
      AssetImage.configure({ inline: false }),
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    editorProps: {
      handlePaste(_view, event) {
        const files = event.clipboardData?.files;
        if (uploadEnabled && files && files.length > 0) {
          Array.from(files).forEach((f) => void insertFile(f));
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        const dt = (event as DragEvent).dataTransfer;
        if (uploadEnabled && dt?.files && dt.files.length > 0) {
          event.preventDefault();
          Array.from(dt.files).forEach((f) => void insertFile(f));
          return true;
        }
        return false;
      },
    },
    content: value,
    onUpdate: ({ editor }) => {
      onChange(normalizeImages(editor.storage.markdown.getMarkdown()));
    },
  });

  editorRef.current = editor;

  if (!editor) {
    return null;
  }

  // Alterna vista sincronizando el contenido entre el textarea y el editor.
  function applyMode(next: "source" | "rich") {
    if (next === mode || !editor) return;
    if (next === "source") {
      setSource(normalizeImages(editor.storage.markdown.getMarkdown()));
    } else {
      editor.commands.setContent(source);
    }
    setMode(next);
  }

  return (
    <div>
      <Toolbar
        editor={editor}
        mode={mode}
        onSetMode={applyMode}
        uploadEnabled={uploadEnabled}
        onPickFile={insertFile}
      />
      {mode === "source" ? (
        <textarea
          className="md-source"
          value={source}
          placeholder={placeholder ?? "Escribe aqui..."}
          onChange={(e) => {
            setSource(e.target.value);
            onChange(e.target.value);
          }}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

function Toolbar({
  editor,
  mode,
  onSetMode,
  uploadEnabled,
  onPickFile,
}: {
  editor: Editor;
  mode: "source" | "rich";
  onSetMode: (mode: "source" | "rich") => void;
  uploadEnabled: boolean;
  onPickFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const btn = (label: ReactNode, isActive: boolean, action: () => void, title: string) => (
    <button
      className={isActive ? "active" : ""}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        action();
      }}
    >
      {label}
    </button>
  );

  // En modo fuente solo se muestra el boton para volver a la vista renderizada.
  if (mode === "source") {
    return (
      <div className="md-toolbar">
        {btn(
          <>
            <i className="ti ti-eye" /> Vista
          </>,
          false,
          () => onSetMode("rich"),
          "Ver renderizado",
        )}
      </div>
    );
  }

  return (
    <>
    <div className="md-toolbar">
      {btn(
        <>
          <i className="ti ti-code" /> Markdown
        </>,
        false,
        () => onSetMode("source"),
        "Ver y editar el markdown",
      )}
      <span className="md-sep" />
      {btn(
        "B",
        editor.isActive("bold"),
        () => editor.chain().focus().toggleBold().run(),
        "Negrita",
      )}
      {btn(
        "I",
        editor.isActive("italic"),
        () => editor.chain().focus().toggleItalic().run(),
        "Cursiva",
      )}
      {btn(
        "H2",
        editor.isActive("heading", { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        "Encabezado",
      )}
      {btn(
        "H3",
        editor.isActive("heading", { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        "Subencabezado",
      )}
      {btn(
        "•",
        editor.isActive("bulletList"),
        () => editor.chain().focus().toggleBulletList().run(),
        "Lista",
      )}
      {btn(
        "1.",
        editor.isActive("orderedList"),
        () => editor.chain().focus().toggleOrderedList().run(),
        "Lista numerada",
      )}
      {btn(
        "</>",
        editor.isActive("codeBlock"),
        () => editor.chain().focus().toggleCodeBlock().run(),
        "Bloque de codigo",
      )}
      {btn(
        "`",
        editor.isActive("code"),
        () => editor.chain().focus().toggleCode().run(),
        "Codigo en linea",
      )}
      {btn(
        <i className="ti ti-quote" />,
        editor.isActive("blockquote"),
        () => editor.chain().focus().toggleBlockquote().run(),
        "Cita",
      )}
      {btn(
        <i className="ti ti-separator-horizontal" />,
        false,
        () => editor.chain().focus().setHorizontalRule().run(),
        "Linea divisoria",
      )}
      {btn(
        <i className="ti ti-link" />,
        editor.isActive("link"),
        () => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          setLinkOpen(true);
        },
        "Enlace",
      )}
      {editor.isActive("codeBlock") && (
        <>
          <span className="md-sep" />
          <select
            className="md-lang"
            title="Lenguaje del bloque de codigo"
            value={String(editor.getAttributes("codeBlock").language ?? "")}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes("codeBlock", { language: e.target.value })
                .run()
            }
          >
            {CODE_LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </>
      )}
      {editor.isActive("image") && (
        <>
          <span className="md-sep" />
          {(["35%", "60%", "100%"] as const).map((w) =>
            btn(
              w === "100%" ? "L" : w === "60%" ? "M" : "S",
              editor.getAttributes("image").alt === w,
              () => editor.chain().focus().updateAttributes("image", { alt: w }).run(),
              `Imagen ${w}`,
            ),
          )}
          {btn(
            "auto",
            false,
            () => editor.chain().focus().updateAttributes("image", { alt: "" }).run(),
            "Tamano original",
          )}
        </>
      )}
      {uploadEnabled && (
        <>
          <button
            title="Adjuntar evidencia (imagen o archivo)"
            onClick={(e) => {
              e.preventDefault();
              fileRef.current?.click();
            }}
          >
            <i className="ti ti-photo-plus" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
      {linkOpen && (
        <PromptDialog
          title="Insertar enlace"
          label="URL del enlace"
          placeholder="https://ejemplo.com"
          confirmLabel="Insertar"
          onConfirm={(url) => editor.chain().focus().toggleLink({ href: url }).run()}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </>
  );
}
