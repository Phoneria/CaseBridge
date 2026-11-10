import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { updateVersion } from "./update-version.mjs";

test("starts at 0.1 and only advances when application content changes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "casebridge-version-"));
  try {
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "page.tsx"), "first page");
    writeFileSync(path.join(root, "app-version.json"), JSON.stringify({ version: "0.1", sourceHash: "" }));
    assert.equal(updateVersion(root), "0.1");
    const first = readFileSync(path.join(root, "app-version.json"), "utf8");
    assert.equal(updateVersion(root), "0.1");
    assert.equal(readFileSync(path.join(root, "app-version.json"), "utf8"), first);
    writeFileSync(path.join(root, "src", "page.tsx"), "updated page");
    assert.equal(updateVersion(root), "0.2");
    assert.equal(updateVersion(root), "0.2");
    mkdirSync(path.join(root, "src", "__tests__"));
    writeFileSync(path.join(root, "src", "__tests__", "page.test.tsx"), "new test");
    assert.equal(updateVersion(root), "0.2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("backend changes advance the version and frontend-only Docker builds preserve it", () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "casebridge-release-"));
  const root = path.join(workspace, "frontend");
  const backend = path.join(workspace, "backend");
  try {
    mkdirSync(root);
    mkdirSync(path.join(backend, "app"), { recursive: true });
    writeFileSync(path.join(backend, "app", "main.py"), "first backend");
    writeFileSync(path.join(root, "app-version.json"), JSON.stringify({ version: "0.1", sourceHash: "" }));
    assert.equal(updateVersion(root), "0.1");
    writeFileSync(path.join(backend, "app", "main.py"), "updated backend");
    assert.equal(updateVersion(root), "0.2");
    rmSync(backend, { recursive: true });
    assert.equal(updateVersion(root), "0.2");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
