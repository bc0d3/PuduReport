// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

// Evita abrir una consola adicional en Windows en modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pudureport_lib::run();
}
