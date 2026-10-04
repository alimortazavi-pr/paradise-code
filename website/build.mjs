import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicFiles = [
  "index.html",
  "style.css",
  "script.js",
  "release.json",
  "assets",
  "extensions/index.html",
  "extensions/catalog.json",
];

export async function validateStylesheet(source) {
  if (/<(?:!doctype|html|head|body)\b/i.test(source)) {
    throw new Error("style.css contains HTML instead of a stylesheet");
  }
  await format(source, { parser: "css" });
}

export async function validateWebsite(directory = root) {
  const css = await readFile(path.join(directory, "style.css"), "utf8");
  await validateStylesheet(css);
  const script = await readFile(path.join(directory, "script.js"), "utf8");
  await format(script, { parser: "babel" });
  const references = new Set();
  for (const file of ["index.html", "extensions/index.html"]) {
    const html = await readFile(path.join(directory, file), "utf8");
    await format(html, { parser: "html" });
    for (const match of html.matchAll(
      /(?:href|src)="(\/[^"?#]*)(?:[?#][^"]*)?"/g,
    )) {
      references.add(match[1]);
    }
  }
  for (const match of css.matchAll(/url\(["']?(\/[^"')?#]+)["']?\)/g)) {
    references.add(match[1]);
  }
  for (const reference of references) {
    const relative = reference.endsWith("/")
      ? `${reference}index.html`
      : reference;
    const location = path.resolve(directory, `.${relative}`);
    if (!location.startsWith(`${path.resolve(directory)}${path.sep}`)) {
      throw new Error(`Asset escapes the website directory: ${reference}`);
    }
    await readFile(location);
  }
  for (const file of ["release.json", "extensions/catalog.json"]) {
    JSON.parse(await readFile(path.join(directory, file), "utf8"));
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await validateWebsite();
  const output = path.join(root, "dist");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const file of publicFiles) {
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await cp(path.join(root, file), path.join(output, file), {
      recursive: true,
    });
  }
  console.log(
    "Website assets parsed and verified; static output ready in dist.",
  );
}
