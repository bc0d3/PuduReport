// Compila el binario `pudureport-mcp` y lo coloca como sidecar de Tauri con el
// sufijo del target triple, en src-tauri/binaries/pudureport-mcp-<triple>[.exe].
//
// Uso: node scripts/build-mcp-sidecar.mjs [target-triple]
// Si no se pasa triple, se usa el host de rustc.
//
// El target indicado debe estar instalado (rustup target add <triple>). El
// workflow de release ya instala el target de cada plataforma de la matriz.

import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function detectTriple() {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const m = out.match(/^host:\s*(.+)$/m);
  if (!m) {
    console.error("No se pudo detectar el host triple desde rustc -vV");
    process.exit(1);
  }
  return m[1].trim();
}

const triple = process.argv[2] || detectTriple();
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exeSuffix = triple.includes("windows") ? ".exe" : "";

console.log(`Compilando pudureport-mcp (release) para ${triple}`);
execFileSync("cargo", ["build", "--release", "-p", "pudureport-mcp", "--target", triple], {
  stdio: "inherit",
  cwd: root,
});

const built = join(root, "target", triple, "release", `pudureport-mcp${exeSuffix}`);
if (!existsSync(built)) {
  console.error(`No se encontro el binario compilado: ${built}`);
  process.exit(1);
}

const outDir = join(root, "src-tauri", "binaries");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `pudureport-mcp-${triple}${exeSuffix}`);
copyFileSync(built, outPath);
if (!exeSuffix) chmodSync(outPath, 0o755);
console.log(`Sidecar colocado en ${outPath}`);
