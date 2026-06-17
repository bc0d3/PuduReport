import { useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../lib/api";

interface Props {
  /** Contenido markdown inicial. El componente debe re-montarse (key) al cambiar de seccion. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Directorio absoluto del proyecto; habilita pegar/soltar evidencias. */
  assetBase?: string | null;
  /** Id del proyecto, requerido para guardar assets. */
  projectId?: string | null;
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

function extFromFile(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
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
export function MarkdownEditor({ value, onChange, placeholder, assetBase, projectId }: Props) {
  const editorRef = useRef<Editor | null>(null);

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
      StarterKit,
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
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  editorRef.current = editor;

  if (!editor) {
    return null;
  }

  return (
    <div>
      <Toolbar editor={editor} uploadEnabled={uploadEnabled} onPickFile={insertFile} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({
  editor,
  uploadEnabled,
  onPickFile,
}: {
  editor: Editor;
  uploadEnabled: boolean;
  onPickFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const btn = (label: string, isActive: boolean, action: () => void, title: string) => (
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

  return (
    <div className="md-toolbar">
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Negrita")}
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
  );
}
