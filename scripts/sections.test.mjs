// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/sections.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { parseSections, joinSections } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("aliases MCP colocan la evidencia en PoC y conservan las otras secciones", () => {
  for (const title of ["PoC", "Proof of concept", "Prueba de concepto"]) {
    const parsed = parseSections(
      `## Descripción\nA\n## Impact\nB\n## ${title}\nC\n## Remediación\nD`,
    );
    assert.deepEqual(parsed, { descripcion: "A", impacto: "B", poc: "C", remediacion: "D" });
    assert.deepEqual(parseSections(joinSections(parsed)), parsed);
  }
});

test("encabezados en codigo no separan secciones, con cierres largos y CRLF", () => {
  for (const fence of ["```", "~~~~"]) {
    const body = `## PoC\r\n${fence}md\r\n## Impacto\r\nSe conserva\r\n${fence.slice(0, 2)}\r\n${fence}${fence[0]}\r\n## Remediation\r\nFix`;
    const parsed = parseSections(body);
    assert.equal(parsed.impacto, "");
    assert.ok(parsed.poc.includes("## Impacto\r\nSe conserva"));
    assert.equal(parsed.remediacion, "Fix");
  }
});

test("preambulo y encabezados desconocidos no se pierden", () => {
  const body = "Preambulo\n## Otro\nDetalle\n## PoC\nPasos\n### Evidencia\nCaptura";
  const parsed = parseSections(body);
  assert.equal(parsed.descripcion, "Preambulo\n## Otro\nDetalle");
  assert.equal(parsed.poc, "Pasos\n### Evidencia\nCaptura");
});
