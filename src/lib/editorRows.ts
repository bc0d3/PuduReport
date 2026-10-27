// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

/** Identidad efimera de filas inmutables. Nunca se agrega al modelo persistido. */
export function createEditorRows<T extends object>() {
  const keys = new WeakMap<T, string>();
  let sequence = 0;
  const key = (value: T): string => {
    let id = keys.get(value);
    if (id === undefined) {
      id = `row-${++sequence}`;
      keys.set(value, id);
    }
    return id;
  };
  return {
    key,
    replace(previous: T, next: T): T {
      keys.set(next, key(previous));
      return next;
    },
  };
}
