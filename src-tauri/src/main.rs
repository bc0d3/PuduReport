// Evita abrir una consola adicional en Windows en modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pudureport_lib::run();
}
