import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Persist this manifest with the release so repeat builds keep the same version.
export function updateVersion(root) {
  const manifestPath = path.join(root, "app-version.json");
  const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
  const hasBackend = existsSync(path.join(root, "../backend/app"));
  // Docker's frontend-only build context uses the version prepared from the
  // full application by deployment/publish.sh, without inventing a new one.
  if (previous.sourceScope === "application" && !hasBackend) return previous.version;
  const sourceScope = hasBackend ? "application" : "frontend";
  const hash = createHash("sha256");
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    const entries = readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      if (entry.name === "__pycache__") continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && !name.includes("/__tests__/") && !/\.(test|spec)\./.test(name)) {
        hash.update(name).update("\0").update(readFileSync(path.join(root, name))).update("\0");
      }
    }
  }
  for (const folder of ["src", "public", "scripts"]) visit(folder);
  if (hasBackend) {
    visit("../backend/app");
    visit("../backend/alembic");
  }
  for (const name of ["package.json", "package-lock.json", "tailwind.config.ts", "next.config.mjs", "tsconfig.json"]) {
    if (existsSync(path.join(root, name))) hash.update(name).update("\0").update(readFileSync(path.join(root, name))).update("\0");
  }
  for (const name of ["../backend/requirements.txt", "../backend/Dockerfile", "Dockerfile", "../deployment/compose.production.yml"]) {
    if (hasBackend && existsSync(path.join(root, name))) hash.update(name).update("\0").update(readFileSync(path.join(root, name))).update("\0");
  }
  const sourceHash = hash.digest("hex");
  let version = previous.version;
  if (previous.sourceHash && previous.sourceHash !== sourceHash) {
    const [major, minor] = version.split(".").map(Number);
    if (!Number.isInteger(major) || !Number.isInteger(minor)) throw new Error("Invalid application version");
    version = `${major}.${minor + 1}`;
  }
  if (previous.sourceHash !== sourceHash || previous.sourceScope !== sourceScope) writeFileSync(manifestPath, `${JSON.stringify({ version, sourceHash, sourceScope }, null, 2)}\n`);
  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`CaseBridge v${updateVersion(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."))}`);
}
