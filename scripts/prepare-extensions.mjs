import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const releaseVersion = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const root = process.cwd(),
  output = path.join(root, "build/extensions");
fs.mkdirSync(output, { recursive: true });
const extension = path.join(root, "extensions/paradise-network"),
  manifest = JSON.parse(fs.readFileSync(path.join(extension, "package.json"))),
  name = `paradise.${manifest.name}-${manifest.version}.vsix`,
  file = path.join(output, name);
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "@vscode/vsce@4.0.0",
    "package",
    "--skip-license",
    "--no-dependencies",
    "--out",
    file,
  ],
  { cwd: extension, stdio: "inherit", shell: process.platform === "win32" },
);
if (result.status !== 0) process.exit(result.status || 1);
const hub = path.join(root, "extensions/paradise-hub");
fs.copyFileSync(
  path.join(extension, "service.cjs"),
  path.join(hub, "network-service.cjs"),
);
fs.mkdirSync(path.join(hub, "packages"), { recursive: true });
fs.copyFileSync(file, path.join(hub, "packages", name));
fs.mkdirSync(path.join(hub, "sdk"), { recursive: true });
for (const name of ["index.cjs", "index.d.ts"])
  fs.copyFileSync(
    path.join(root, "packages/paradise-sdk", name),
    path.join(hub, "sdk", name),
  );
const catalog = {
  schema: 1,
  extensions: [
    {
      id: "paradise.network",
      name: manifest.displayName,
      description: manifest.description,
      version: manifest.version,
      platforms: ["darwin"],
      download: `https://github.com/alimortazavi-pr/paradise-code/releases/download/v${releaseVersion}/${name}`,
      sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    },
  ],
};
fs.writeFileSync(
  path.join(hub, "catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
fs.mkdirSync("website/extensions", { recursive: true });
fs.writeFileSync(
  "website/extensions/catalog.json",
  JSON.stringify(catalog, null, 2) + "\n",
);
