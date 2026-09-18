// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/markdownFormatting.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { formatMarkdown } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("formato conserva texto externo y permite quitar negrita", () => {
  const value = "Antes evidencia despues";
  const edit = formatMarkdown(value, 6, 15, "bold");
  const next = value.slice(0, edit.start) + edit.replacement + value.slice(edit.end);
  assert.equal(next, "Antes **evidencia** despues");
  const undo = formatMarkdown(next, edit.selectionStart, edit.selectionEnd, "bold");
  assert.equal(next.slice(0, undo.start) + undo.replacement + next.slice(undo.end), value);
});
test("listas operan sobre lineas completas sin tocar la siguiente", () => {
  const edit = formatMarkdown("uno\ndos\nfinal", 1, 8, "ordered");
  assert.equal(edit.replacement, "1. uno\n2. dos");
  assert.equal(edit.end, 7);
});
test("enlace selecciona URL y el cursor vacio queda entre delimitadores", () => {
  const link = formatMarkdown("captura", 0, 7, "link");
  assert.equal(link.replacement.slice(link.selectionStart, link.selectionEnd), "https://");
  const bold = formatMarkdown("", 0, 0, "bold");
  assert.equal(bold.replacement, "****");
  assert.equal(bold.selectionStart, 2);
});

test("cursiva no consume los asteriscos de negrita", () => {
  const edit = formatMarkdown("**texto**", 2, 7, "italic");
  assert.equal(
    "**texto**".slice(0, edit.start) + edit.replacement + "**texto**".slice(edit.end),
    "***texto***",
  );
  const remove = formatMarkdown("***texto***", 3, 8, "italic");
  assert.equal(
    "***texto***".slice(0, remove.start) + remove.replacement + "***texto***".slice(remove.end),
    "**texto**",
  );
});

test("bloque de codigo separa la prosa y conserva fences internos y variables", () => {
  const selected = "```sh\necho {{cliente}}\n```";
  const value = "Antes " + selected + " despues";
  const edit = formatMarkdown(value, 6, 6 + selected.length, "codeblock");
  assert.equal(edit.replacement, "\n\n````\n" + selected + "\n````\n\n");
  const result = value.slice(0, edit.start) + edit.replacement + value.slice(edit.end);
  assert.equal(result.slice(edit.selectionStart, edit.selectionEnd), selected);
  assert.ok(result.startsWith("Antes "));
  assert.ok(result.endsWith(" despues"));
});
