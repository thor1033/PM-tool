/* Extract the seeded sample projects (Helios, Migration, Intranet) from the
   legacy Atlas bundle's store module by evaluating just that IIFE in Node with
   minimal browser stubs. Writes scripts/seed-projects.json in Atlas export
   shape: { version: 2, projects: [...] }. Run: node scripts/extract-seed.mjs */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bundle = fs.readFileSync(
  path.join(root, "legacy", "atlas-bundle.jsx"),
  "utf8",
);

// The store IIFE is the first module; it ends at the first `})();` line.
const lines = bundle.split("\n");
const endIdx = lines.findIndex((l) => l.trim() === "})();");
if (endIdx === -1) throw new Error("Could not locate end of store IIFE");
const storeSrc = lines.slice(0, endIdx + 1).join("\n");

const sandbox = {
  console,
  Math,
  Date,
  JSON,
  Array,
  Object,
  window: {},
  React: {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  indexedDB: {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(storeSrc, sandbox);

const Store = sandbox.window.Store;
if (!Store) throw new Error("window.Store not defined after eval");
const root2 = Store.getRoot();
const out = { atlas: true, version: 2, projects: root2.projects };
const dest = path.join(root, "scripts", "seed-projects.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(
  `Wrote ${out.projects.length} projects to ${path.relative(root, dest)}`,
);
for (const p of out.projects)
  console.log(
    `  - ${p.meta.project} (${p.tasks.length} tasks, ${p.risks.length} risks)`,
  );
