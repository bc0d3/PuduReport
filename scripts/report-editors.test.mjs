// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function load(name) {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { selectionAfterMove } = await load("reportLayout");
const { createEditorRows } = await load("editorRows");

test("la seleccion sigue el mismo bloque en todos los movimientos de un documento", () => {
  const blocks = ["cover", "text-a", "section", "text-b", "findings"];
  for (let from = 0; from < blocks.length; from++) {
    for (let to = 0; to < blocks.length; to++) {
      const reordered = [...blocks];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      for (let selected = 0; selected < blocks.length; selected++) {
        assert.equal(reordered[selectionAfterMove(selected, from, to)], blocks[selected]);
      }
    }
  }
});

test("editar, eliminar y reordenar acciones preserva claves sin alterar el JSON", () => {
  const rows = createEditorRows();
  const first = { accion: "Validar entradas", responsable: "Equipo A", hallazgos: [] };
  const second = { ...first, hallazgos: [] };
  const third = { ...first, hallazgos: [] };
  const plan = [first, second, third];
  const original = JSON.stringify(plan);
  const keys = plan.map(rows.key);
  assert.equal(new Set(keys).size, 3, "filas iguales tienen identidades distintas");
  assert.equal(JSON.stringify(plan), original);
  const changed = rows.replace(second, { ...second, accion: "Aplicar parche" });
  const next = [third, changed];
  assert.deepEqual(next.map(rows.key), [keys[2], keys[1]]);
  assert.equal(second.accion, "Validar entradas");
  assert.deepEqual(Object.keys(changed), Object.keys(second));
  assert.notEqual(rows.key({ ...changed }), rows.key(changed), "una copia es una fila nueva");
});
