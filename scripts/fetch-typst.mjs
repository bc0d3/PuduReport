// Descarga el binario de Typst y lo coloca como sidecar de Tauri con el sufijo
// del target triple, en src-tauri/binaries/typst-<triple>[.exe].
//
// Uso: node scripts/fetch-typst.mjs [target-triple]
// Si no se pasa triple, se detecta a partir de la plataforma actual.
//
// Requiere Node 20+ (fetch global) y `tar` en el PATH (disponible en los
// runners de GitHub para macOS, Linux y Windows, donde bsdtar extrae .zip).

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, chmodSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TYPST_VERSION = process.env.TYPST_VERSION || "v0.13.1";

const ASSET = {
  "x86_64-unknown-linux-gnu": "typst-x86_64-unknown-linux-musl.tar.xz",
  "aarch64-unknown-linux-gnu": "typst-aarch64-unknown-linux-musl.tar.xz",
  "x86_64-apple-darwin": "typst-x86_64-apple-darwin.tar.xz",
  "aarch64-apple-darwin": "typst-aarch64-apple-darwin.tar.xz",
  "x86_64-pc-windows-msvc": "typst-x86_64-pc-windows-msvc.zip",
};

function detectTriple() {
  const { platform, arch } = process;
  const a = arch === "arm64" ? "aarch64" : "x86_64";
  if (platform === "darwin") return `${a}-apple-darwin`;
  if (platform === "win32") return "x86_64-pc-windows-msvc";
  return `${a}-unknown-linux-gnu`;
}

const triple = process.argv[2] || detectTriple();
const asset = ASSET[triple];
if (!asset) {
  console.error(`Triple no soportado: ${triple}`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "binaries");
const exeSuffix = triple.includes("windows") ? ".exe" : "";
const outPath = join(outDir, `typst-${triple}${exeSuffix}`);

const url = `https://github.com/typst/typst/releases/download/${TYPST_VERSION}/${asset}`;
const work = mkdtempSync(join(tmpdir(), "typst-"));
const archivePath = join(work, asset);

console.log(`Descargando ${url}`);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Fallo la descarga: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const { writeFileSync } = await import("node:fs");
writeFileSync(archivePath, buf);

// tar extrae tanto .tar.xz como .zip (bsdtar en los runners).
execFileSync("tar", ["-xf", archivePath, "-C", work], { stdio: "inherit" });

// Buscar el binario typst dentro del directorio extraido.
function findTypst(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const found = findTypst(full);
      if (found) return found;
    } else if (name === "typst" || name === "typst.exe") {
      return full;
    }
  }
  return null;
}

const bin = findTypst(work);
if (!bin) {
  console.error("No se encontro el binario typst en el archivo descargado");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(bin, outPath);
if (!exeSuffix) chmodSync(outPath, 0o755);
console.log(`Sidecar colocado en ${outPath}`);
