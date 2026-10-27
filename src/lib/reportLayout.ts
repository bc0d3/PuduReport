// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

/** Posicion de la seleccion despues de mover un bloque dentro del documento. */
export function selectionAfterMove(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
}
