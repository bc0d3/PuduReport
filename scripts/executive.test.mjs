// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/executive.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const {
  CATEGORIA_RIESGO_OPTIONS,
  PRIORIDAD_OPTIONS,
  IMPACTO_NEGOCIO_MAX,
  singleParagraph,
  charCount,
  nextRootCauseKey,
  newRemediationAction,
  findingNumbers,
  toggleFindingId,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const finding = (id, hidden = false) => ({ id, meta: { hidden }, body: "" });

test("listas cerradas espejan las del backend", () => {
  assert.deepEqual(
    CATEGORIA_RIESGO_OPTIONS.map((o) => o.value),
    [
      "",
      "fuga_datos",
      "fraude_economico",
      "interrupcion_servicio",
      "incumplimiento_regulatorio",
      "reputacional",
      "reconocimiento",
    ],
  );
  assert.deepEqual(
    PRIORIDAD_OPTIONS.map((o) => o.value),
    ["", "inmediata", "corto", "mediano", "cierre"],
  );
  assert.equal(newRemediationAction().prioridad, "inmediata");
});

test("singleParagraph quita saltos de linea y corta por caracteres", () => {
  assert.equal(singleParagraph("uno\ndos\r\ntres\rcuatro", 100), "uno dos tres cuatro");
  // Conserva espacios finales (no mueve el cursor al escribir).
  assert.equal(singleParagraph("texto ", 100), "texto ");
  const long = "ñ".repeat(IMPACTO_NEGOCIO_MAX + 20);
  assert.equal(charCount(singleParagraph(long, IMPACTO_NEGOCIO_MAX)), IMPACTO_NEGOCIO_MAX);
});

test("nextRootCauseKey devuelve una clave libre y estable", () => {
  assert.equal(nextRootCauseKey([]), "causa-1");
  assert.equal(nextRootCauseKey([{ clave: "causa-1" }, { clave: "validacion" }]), "causa-3");
  assert.equal(nextRootCauseKey([{ clave: "causa-2" }]), "causa-3");
});

test("findingNumbers numera como el PDF, sin contar los ocultos", () => {
  const numbers = findingNumbers([finding("a"), finding("b", true), finding("c")]);
  assert.equal(numbers.get("a"), 1);
  assert.equal(numbers.has("b"), false);
  assert.equal(numbers.get("c"), 2);
});

test("toggleFindingId agrega y quita respetando el orden del reporte", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(toggleFindingId([], "c", order), ["c"]);
  assert.deepEqual(toggleFindingId(["c"], "a", order), ["a", "c"]);
  assert.deepEqual(toggleFindingId(["a", "c"], "a", order), ["c"]);
  // Un id que ya no esta en el orden se conserva al final (el backend lo filtra).
  assert.deepEqual(toggleFindingId(["x"], "b", order), ["b", "x"]);
});
