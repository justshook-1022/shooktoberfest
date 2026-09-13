import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = resolve(root, "design-lock.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

async function checkFile(relativePath, expected) {
  try {
    const actual = sha1(await readFile(resolve(root, relativePath)));
    if (actual !== expected) failures.push(`${relativePath}\n  expected ${expected}\n  received ${actual}`);
  } catch (error) {
    failures.push(`${relativePath}\n  ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const [relativePath, expected] of Object.entries(manifest.files)) {
  await checkFile(relativePath, expected);
}

try {
  const stylesheet = await readFile(resolve(root, manifest.css.file), "utf8");
  const markerIndex = stylesheet.indexOf(manifest.css.prefixBefore);
  if (markerIndex < 0) {
    failures.push(`${manifest.css.file}\n  missing protected boundary ${manifest.css.prefixBefore}`);
  } else {
    const protectedCss = `${stylesheet.slice(0, markerIndex).trimEnd()}\n`;
    const actual = sha1(protectedCss);
    if (actual !== manifest.css.sha1) {
      failures.push(`${manifest.css.file} (public design section)\n  expected ${manifest.css.sha1}\n  received ${actual}`);
    }
  }
} catch (error) {
  failures.push(`${manifest.css.file}\n  ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error(`\nDESIGN LOCK FAILED (${failures.length} protected change${failures.length === 1 ? "" : "s"})\n`);
  console.error(failures.join("\n\n"));
  console.error(`\nApproved deployment: ${manifest.approvedDeployment.id}`);
  console.error("Do not update design-lock.json to make this pass unless Justin explicitly approved a visual change.");
  process.exit(1);
}

console.log(`Design lock passed: ${Object.keys(manifest.files).length} files and the public CSS match ${manifest.approvedDeployment.id}.`);
