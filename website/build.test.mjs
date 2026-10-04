import assert from "node:assert/strict";
import { cp, mkdtemp, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateStylesheet, validateWebsite } from "./build.mjs";

test("HTML accidentally written to the stylesheet blocks publication", async () => {
  await assert.rejects(
    validateStylesheet("<!doctype html><html><body>Page</body></html>"),
    /contains HTML/,
  );
});

test("malformed CSS blocks publication", async () => {
  await assert.rejects(validateStylesheet("body { color: red;"));
});

test("all current page, script, font and image references are valid", async () => {
  await validateWebsite();
});

test("a missing referenced asset blocks publication", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "paradise-website-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await cp(
    new URL("./assets/", import.meta.url),
    path.join(fixture, "assets"),
    { recursive: true },
  );
  await cp(
    new URL("./extensions/", import.meta.url),
    path.join(fixture, "extensions"),
    { recursive: true },
  );
  for (const file of ["index.html", "style.css", "script.js", "release.json"]) {
    await cp(new URL(`./${file}`, import.meta.url), path.join(fixture, file));
  }
  await unlink(path.join(fixture, "assets/sora-bold.ttf"));
  await assert.rejects(validateWebsite(fixture), /ENOENT/);
});
