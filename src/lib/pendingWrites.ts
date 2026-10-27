// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

type Write = () => Promise<void>;
interface Entry {
  task?: Write;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<void>;
}
const entries = new Map<string, Entry>();
// El bloqueo de core es por workspace: tampoco solapar archivos distintos desde la UI.
let writeTail: Promise<void> = Promise.resolve();

async function drainEntry(key: string, entry: Entry): Promise<void> {
  clearTimeout(entry.timer);
  const task = entry.task;
  if (!task) {
    if (entries.get(key) === entry) entries.delete(key);
    return;
  }
  entry.task = undefined;
  const writing = writeTail.then(task);
  writeTail = writing.catch(() => undefined);
  try {
    await writing;
  } catch (error) {
    entry.task ??= task;
    throw error;
  }
  // Cada paso cede al executor; un fallo conserva el borrador y detiene el drenaje.
  return drainEntry(key, entry);
}

function flushEntry(key: string, entry: Entry): Promise<void> {
  clearTimeout(entry.timer);
  // Todos los flush de un archivo comparten el mismo drenaje, tambien ante error.
  entry.running ??= drainEntry(key, entry).finally(() => {
    entry.running = undefined;
  });
  return entry.running;
}

/** Coalesce por archivo y serializa escrituras; un fallo conserva el ultimo borrador. */
export function scheduleWrite(
  key: string,
  task: Write,
  delay: number,
  onError: (error: unknown) => void,
) {
  const entry = entries.get(key) ?? {};
  entries.set(key, entry);
  clearTimeout(entry.timer);
  entry.task = task;
  entry.timer = setTimeout(() => {
    void flushEntry(key, entry).catch(onError);
  }, delay);
}

/** La navegacion solo continua cuando el backend confirma todas las escrituras. */
export async function flushWrites(): Promise<void> {
  await Promise.all([...entries].map(([key, entry]) => flushEntry(key, entry)));
}
