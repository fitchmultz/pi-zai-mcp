import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const directive = /(?:\/\/|\/\*|\r?\n)\s*\**\s*(?:(?:oxlint|eslint)-disable(?:-next-line|-line)?|@ts-(?:ignore|nocheck))\b/g;

/** @param {string} directory @returns {Promise<string[]>} */
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(/** @param {Readonly<Pick<import("node:fs").Dirent, "name" | "isDirectory">>} entry */ (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === ".git" ? Promise.resolve([]) : sourceFiles(path);
    }
    return Promise.resolve(sourceExtension.test(entry.name) ? [path] : []);
  }));
  return files.flat();
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: node scripts/check-lint-directives.mjs\n\nReject inline lint and TypeScript suppressions in all repository JS/TS source files.\nRun from the repository root; example: npm run lint.\nExit codes: 0 clean, 1 forbidden directive or scan failure.");
    return;
  }
  const files = await sourceFiles(".");
  const findings = await Promise.all(files.map(async (path) => {
    const source = await readFile(path, "utf8");
    return [...source.matchAll(directive)].map(/** @param {Readonly<Pick<RegExpMatchArray, "index">> & {readonly 0: string}} match */ (match) => {
      const line = source.slice(0, match.index).split("\n").length + match[0].split("\n").length - 1;
      return `${path}:${line}: Inline lint suppressions are forbidden; fix the underlying code.`;
    });
  }));
  const violations = findings.flat();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  }
}

main().catch(/** @param {unknown} error */ (error) => { console.error(error); process.exitCode = 1; });
