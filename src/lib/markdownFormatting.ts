// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

export type MarkdownAction =
  | "bold"
  | "italic"
  | "code"
  | "codeblock"
  | "heading"
  | "list"
  | "ordered"
  | "quote"
  | "link";

/** Edicion localizada: conserva literalmente el resto del Markdown. */
export function formatMarkdown(value: string, start: number, end: number, action: MarkdownAction) {
  let text = value.slice(start, end);
  if (action === "codeblock") {
    // Un fence mayor que cualquier secuencia interna conserva ejemplos Markdown.
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longest + 1));
    const before = start > 0 && !value.slice(0, start).endsWith("\n\n") ? "\n\n" : "";
    const after = end < value.length && !value.slice(end).startsWith("\n\n") ? "\n\n" : "";
    const prefix = before + fence + "\n";
    return {
      start,
      end,
      replacement: prefix + text + (text.endsWith("\n") ? "" : "\n") + fence + after,
      selectionStart: start + prefix.length,
      selectionEnd: start + prefix.length + text.length,
    };
  }
  if (["heading", "list", "ordered", "quote"].includes(action)) {
    start = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
    end = lineEnd < 0 ? value.length : lineEnd;
    text = value.slice(start, end);
    const prefix = (i: number) =>
      action === "heading"
        ? "### "
        : action === "quote"
          ? "> "
          : action === "ordered"
            ? `${i + 1}. `
            : "- ";
    const lines = text.split("\n");
    const remove = lines.every((line, i) => line.startsWith(prefix(i)));
    const replacement = lines
      .map((line, i) => (remove ? line.slice(prefix(i).length) : prefix(i) + line))
      .join("\n");
    return {
      start,
      end,
      replacement,
      selectionStart: start,
      selectionEnd: start + replacement.length,
    };
  }
  if (action === "link") {
    const replacement = `[${text || "texto"}](https://)`;
    return {
      start,
      end,
      replacement,
      selectionStart: start + replacement.length - 9,
      selectionEnd: start + replacement.length - 1,
    };
  }
  const marker = action === "bold" ? "**" : action === "italic" ? "*" : "`";
  const oddStars = (s: string, atEnd = false) =>
    (s.match(atEnd ? /\*+$/ : /^\*+/)?.[0].length ?? 0) % 2 === 1;
  if (
    text.startsWith(marker) &&
    text.endsWith(marker) &&
    text.length >= marker.length * 2 &&
    (action !== "italic" || (oddStars(text) && oddStars(text, true)))
  ) {
    const replacement = text.slice(marker.length, -marker.length);
    return {
      start,
      end,
      replacement,
      selectionStart: start,
      selectionEnd: start + replacement.length,
    };
  }
  if (
    value.slice(Math.max(0, start - marker.length), start) === marker &&
    value.slice(end, end + marker.length) === marker &&
    (action !== "italic" || (oddStars(value.slice(0, start), true) && oddStars(value.slice(end))))
  ) {
    start -= marker.length;
    end += marker.length;
    return {
      start,
      end,
      replacement: text,
      selectionStart: start,
      selectionEnd: start + text.length,
    };
  }
  return {
    start,
    end,
    replacement: marker + text + marker,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + text.length,
  };
}
