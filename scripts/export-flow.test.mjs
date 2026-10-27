// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/exportFlow.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createExportFlow } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const context = {
  key: "workspace/project/target/legacy",
  projectId: "project",
  targetName: "target",
};
const prepared = {
  preparation_id: "snapshot-1",
  destination_url: "https://example.invalid/import",
  profile: "legacy",
  payload: '{"exported_at":"fixed"}',
};
function deferred() {
  return Promise.withResolvers();
}
function fixture(overrides = {}) {
  const states = [];
  const sent = [];
  const flow = createExportFlow(
    {
      flush: async () => {},
      prepare: async () => prepared,
      hasToken: async () => true,
      send: async (...args) => {
        sent.push(args);
        return { ok: true, status: 202, body: "accepted" };
      },
      ...overrides,
    },
    (state) => states.push(state),
  );
  return { flow, states, sent, last: () => states.at(-1) };
}

test("prepara despues de guardar y envia la preparacion revisada una sola vez", async () => {
  const save = deferred();
  let reads = 0;
  const f = fixture({
    flush: () => save.promise,
    prepare: async () => {
      reads++;
      return prepared;
    },
  });
  const pending = f.flow.prepare(context);
  assert.equal(f.last().kind, "loading");
  assert.equal(reads, 0);
  save.resolve();
  await pending;
  assert.equal(f.last().prepared.payload, prepared.payload);
  await Promise.all([f.flow.send(context.key), f.flow.send(context.key)]);
  assert.deepEqual(f.sent, [["project", "target", "snapshot-1"]]);
  await f.flow.send(context.key);
  assert.equal(f.sent.length, 1);
});

test("fallo de guardado bloquea preparacion y envio, sin perder el error", async () => {
  let reads = 0;
  const f = fixture({
    flush: async () => {
      throw new Error("borrador sin guardar");
    },
    prepare: async () => {
      reads++;
      return prepared;
    },
  });
  await f.flow.prepare(context);
  assert.equal(reads, 0);
  assert.match(f.last().message, /borrador/);
  await f.flow.send(context.key);
  assert.equal(f.sent.length, 0);
});

test("respuestas fuera de orden y cambios de perfil conservan solo el contexto vigente", async () => {
  const a = deferred(),
    b = deferred();
  let calls = 0;
  const f = fixture({ prepare: () => (++calls === 1 ? a.promise : b.promise) });
  const old = f.flow.prepare(context);
  await Promise.resolve();
  const newer = { ...context, key: "new-profile-fields" };
  const current = f.flow.prepare(newer);
  await Promise.resolve();
  b.resolve({ ...prepared, preparation_id: "new" });
  await current;
  a.resolve(prepared);
  await old;
  assert.equal(f.last().prepared.preparation_id, "new");
  await f.flow.send(context.key);
  assert.equal(f.sent.length, 0);
  await f.flow.send(newer.key);
  assert.equal(f.sent[0][2], "new");
});

test("cerrar o cambiar workspace durante guardado o lectura invalida respuestas", async () => {
  for (const phase of ["flush", "prepare"]) {
    const pending = deferred();
    const f = fixture({ [phase]: () => pending.promise });
    const task = f.flow.prepare(context);
    await Promise.resolve();
    f.flow.invalidate();
    pending.resolve(phase === "prepare" ? prepared : undefined);
    await task;
    assert.equal(f.last().kind, "idle");
    await f.flow.send(context.key);
    assert.equal(f.sent.length, 0);
  }
});

test("error de keychain es diferente de token ausente", async () => {
  const absent = fixture({ hasToken: async () => false });
  await absent.flow.prepare(context);
  assert.equal(absent.last().kind, "ready");
  await absent.flow.send(context.key);
  assert.equal(absent.sent.length, 0);
  const failed = fixture({
    hasToken: async () => {
      throw new Error("keychain bloqueado");
    },
  });
  await failed.flow.prepare(context);
  assert.equal(failed.last().kind, "error");
  assert.match(failed.last().message, /keychain/);
});

test("rechazo HTTP e IPC requieren otra revision, sin reintentos automaticos", async () => {
  for (const send of [
    async () => ({ ok: false, status: 422, body: "incompatible" }),
    async () => {
      throw new Error("cambio el proyecto");
    },
  ]) {
    let calls = 0;
    const f = fixture({
      send: async () => {
        calls++;
        return send();
      },
    });
    await f.flow.prepare(context);
    await f.flow.send(context.key);
    assert.equal(f.last().kind, "error");
    await f.flow.send(context.key);
    assert.equal(calls, 1);
  }
});

test("respuesta de POST tardia no cierra otra vista ni permite doble envio en curso", async () => {
  const response = deferred();
  let posts = 0;
  const f = fixture({
    send: () => {
      posts++;
      return response.promise;
    },
  });
  await f.flow.prepare(context);
  const sending = f.flow.send(context.key);
  await Promise.resolve();
  f.flow.invalidate();
  const newer = { ...context, key: "other-project", projectId: "other" };
  await f.flow.prepare(newer);
  await f.flow.send(newer.key);
  assert.equal(posts, 1);
  response.resolve({ ok: true, status: 200, body: "" });
  assert.equal(await sending, undefined);
  assert.equal(f.last().context.key, newer.key);
  assert.equal(f.last().kind, "ready");
});

test("cambiar contexto durante flush de envio impide el POST", async () => {
  const save = deferred();
  let flushes = 0;
  const f = fixture({
    flush: async () => {
      if (++flushes > 1) await save.promise;
    },
  });
  await f.flow.prepare(context);
  const task = f.flow.send(context.key);
  f.flow.invalidate();
  save.resolve();
  await task;
  assert.equal(f.sent.length, 0);
});
