// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/projectSchedule.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { calendarDay, todayDay, projectSchedule } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const today = calendarDay("2026-09-17");
const schedule = (end_date, overrides = {}) =>
  projectSchedule(
    {
      start_date: "2026-09-01",
      end_date,
      project_status: "inprogress",
      ...overrides,
    },
    today,
  );

test("fechas invalidas y rangos invertidos no generan plazos falsos", () => {
  for (const value of ["", "2026-02-29", "2026-09-31", "2026-9-1", "texto"])
    assert.equal(calendarDay(value), null);
  assert.notEqual(calendarDay("2024-02-29"), null);
  assert.equal(schedule("2026-08-30").kind, "invalid");
  assert.equal(schedule("2026-09-31").remaining, null);
  assert.equal(schedule("").kind, "undated");
});

test("vencimientos incluyen hoy y siete dias; finalizados no quedan vencidos", () => {
  for (const [end, kind] of [
    ["16", "overdue"],
    ["17", "today"],
    ["18", "upcoming"],
    ["24", "upcoming"],
    ["25", "scheduled"],
  ])
    assert.equal(schedule(`2026-09-${end}`).kind, kind);
  assert.equal(schedule("2026-09-16", { project_status: "done" }).kind, "done");
});

test("plazo transcurrido es acotado y no divide por cero", () => {
  assert.equal(schedule("2026-09-21", { start_date: "2026-09-13" }).elapsed, 50);
  assert.equal(schedule("2026-09-25", { start_date: "2026-09-20" }).elapsed, 0);
  assert.equal(schedule("2026-09-15").elapsed, 100);
  assert.equal(schedule("2026-09-17", { start_date: "2026-09-17" }).elapsed, null);
  assert.equal(schedule("2026-09-20", { start_date: "" }).elapsed, null);
});

test("dias calendario cruzan cambios de hora y de ano sin perder un dia", () => {
  assert.equal(calendarDay("2026-09-07") - calendarDay("2026-09-05"), 2);
  assert.equal(calendarDay("2027-01-01") - calendarDay("2026-12-31"), 1);
  const original = process.env.TZ;
  try {
    process.env.TZ = "America/Santiago";
    assert.equal(todayDay(new Date("2026-09-18T01:00:00Z")), today);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
