import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseSync } from "oxc-parser";

const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const lintDirective = /^(?:oxlint|eslint)-(?:disable|enable)\b|^(?:oxlint|eslint)\s+\S/;
const typeDirective = /^@ts-(?:ignore|nocheck|expect-error)/;
const approvedDisable =
  /^oxlint-disable-next-line\s+(no-await-in-loop|vitest\/no-conditional-expect|typescript\/prefer-readonly-parameter-types|typescript\/no-unnecessary-condition|no-control-regex)(?:\s+--\s+(.+))?$/;
const testFile = /(?:\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$|(?:^|[/\\])__tests__[/\\])/;

/** @param {string} path @returns {Promise<string[]>} */
async function sourceFiles(path) {
  if (!(await stat(path)).isDirectory()) {
    if (!sourceExtension.test(path)) {
      throw new Error(`Not a JavaScript or TypeScript source file: ${path}`);
    }
    return [path];
  }
  const entries = await readdir(path, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isSymbolicLink() || entry.name === "node_modules" || entry.name === ".git") {
        return [];
      }
      const child = join(path, entry.name);
      return entry.isDirectory() || sourceExtension.test(entry.name) ? sourceFiles(child) : [];
    }),
  );
  return children.flat();
}

/** @param {string} value @returns {string[]} */
function commentLines(value) {
  return value.split(/\r?\n/).map((line) =>
    line
      .trim()
      .replace(/^\*\s?/, "")
      .trim(),
  );
}

/** @param {string} reason @returns {boolean} */
function usefulReason(reason) {
  const text = reason.trim();
  return (
    text.replace(/\s/g, "").length >= 10 &&
    !/^(?:intentionally (?:disabled|empty)|lint (?:exception|suppression)|needed (?:for|to)|ignore (?:this|the) (?:error|rule))[.!]?$/i.test(
      text,
    ) &&
    !lintDirective.test(text) &&
    !typeDirective.test(text)
  );
}

/** @param {string} source @param {Readonly<{start: number; end: number; value: string}> | undefined} previous @param {number} start @returns {string} */
function adjacentReason(source, previous, start) {
  if (previous === undefined) {
    return "";
  }
  const gap = source.slice(previous.end, start);
  if (!/^\s*$/.test(gap) || gap.split("\n").length > 2) {
    return "";
  }
  return commentLines(previous.value).join(" ");
}

/** @param {string} path @param {string} directive @returns {string | undefined} */
function typeViolation(path, directive) {
  const description = directive.replace(/^@ts-expect-error\b\s*:?\s*/, "");
  if (
    path.endsWith(".test-d.ts") &&
    /^@ts-expect-error(?:\s|:|$)/.test(directive) &&
    description.trim().length >= 10
  ) {
    return;
  }
  return "Compiler suppressions require a described @ts-expect-error in a dedicated *.test-d.ts type test.";
}

/** @param {string} path @param {string} directive @param {string} reason @returns {string | undefined} */
function violation(path, directive, reason) {
  if (typeDirective.test(directive)) {
    return typeViolation(path, directive);
  }
  if (!lintDirective.test(directive)) {
    return;
  }
  const approved = approvedDisable.exec(directive);
  const isTest =
    testFile.test(path) ||
    path.endsWith("scripts/smoke.mjs") ||
    path.endsWith("test/fixtures/vision-offline.mjs");
  if (
    approved !== null &&
    (approved[1] !== "vitest/no-conditional-expect" || isTest) &&
    usefulReason(approved[2] ?? reason)
  ) {
    return;
  }
  return "Only documented single-site sequencing, test assertion, generic callback, live lifecycle guard or control-validation exceptions are approved.";
}

/** @param {string} path @returns {Promise<string[]>} */
async function checkFile(path) {
  const source = await readFile(path, "utf8");
  const parsed = parseSync(path, source);
  if (parsed.errors.length > 0) {
    throw new Error(
      `${path}: Cannot inspect directives in invalid source: ${parsed.errors.map((error) => error.message).join("; ")}`,
    );
  }
  /** @type {string[]} */
  const findings = [];
  for (const [index, comment] of parsed.comments.entries()) {
    const reason = adjacentReason(source, parsed.comments[index - 1], comment.start);
    const line = source.slice(0, comment.start).split("\n").length;
    for (const [offset, directive] of commentLines(comment.value).entries()) {
      const problem =
        /[\r\n]/.test(comment.value) && lintDirective.test(directive)
          ? "Lint directives must use a single-line comment; continuation lines can hide extra rules."
          : violation(path, directive, reason);
      if (problem !== undefined) {
        findings.push(`${path}:${line + offset}: ${problem}`);
      }
    }
  }
  return findings;
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.includes("--help") || paths.includes("-h")) {
    console.log(
      "Usage: node scripts/check-lint-directives.mjs [FILE|DIRECTORY ...]\n\nCheck actual JS/TS comments, not strings or documentation examples.\nOnly explained single-site semantic exceptions and described\ntype-test @ts-expect-error directives are allowed. Default scope: repository.\nExamples: npm run lint:policy; node scripts/check-lint-directives.mjs src test\nExit codes: 0 clean/help, 1 forbidden directive, invalid source or scan failure.",
    );
    return;
  }
  if (paths.some((path) => path.startsWith("-"))) {
    throw new Error("Unknown option. Use --help for usage.");
  }
  const files = new Set(
    (await Promise.all((paths.length > 0 ? paths : ["."]).map(sourceFiles))).flat(),
  );
  const findings = (await Promise.all([...files].map(checkFile))).flat();
  if (findings.length > 0) {
    console.error(findings.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((/** @type {unknown} */ error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
