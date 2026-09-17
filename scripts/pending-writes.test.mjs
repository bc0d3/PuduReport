// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/pendingWrites.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { scheduleWrite, flushWrites } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("navegar guarda el ultimo cambio por archivo y conserva otros hallazgos", async () => {
  const writes = [];
  scheduleWrite(
    "finding:a:1",
    async () => {
      writes.push("old");
    },
    600,
    assert.fail,
  );
  scheduleWrite(
    "finding:a:1",
    async () => {
      writes.push("new");
    },
    600,
    assert.fail,
  );
  scheduleWrite(
    "finding:a:2",
    async () => {
      writes.push("other");
    },
    600,
    assert.fail,
  );
  await flushWrites();
  assert.deepEqual(writes.sort(), ["new", "other"]);
});

test("escrituras del mismo archivo esperan la anterior aunque haya varios flush", async () => {
  const writes = [];
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  scheduleWrite(
    "project:a",
    async () => {
      writes.push("start");
      await waiting;
      writes.push("end");
    },
    600,
    assert.fail,
  );
  const first = flushWrites();
  scheduleWrite(
    "project:a",
    async () => {
      writes.push("latest");
    },
    600,
    assert.fail,
  );
  const second = flushWrites();
  assert.deepEqual(writes, ["start"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["start", "end", "latest"]);
});

test("un error bloquea navegacion y permite reintentar el borrador", async () => {
  let attempts = 0;
  scheduleWrite(
    "project:b",
    async () => {
      if (++attempts === 1) throw new Error("disk unavailable");
    },
    600,
    assert.fail,
  );
  await assert.rejects(flushWrites(), /disk unavailable/);
  await flushWrites();
  assert.equal(attempts, 2);
});
