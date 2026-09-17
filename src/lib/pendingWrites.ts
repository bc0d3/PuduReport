// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

type Write = () => Promise<void>;
interface Entry {
  task?: Write;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<void>;
}
const entries = new Map<string, Entry>();

async function flushEntry(key: string, entry: Entry): Promise<void> {
  clearTimeout(entry.timer);
  while (entry.running || entry.task) {
    if (entry.running) {
      await entry.running;
      continue;
    }
    const task = entry.task;
    if (!task) continue;
    entry.task = undefined;
    const running = task();
    entry.running = running;
    try {
      await running;
    } catch (error) {
      entry.task ??= task;
      throw error;
    } finally {
      entry.running = undefined;
    }
  }
  if (entries.get(key) === entry) entries.delete(key);
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
