import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("../", import.meta.url));
export const oxlint = join(repo, "node_modules/.bin/oxlint");
export const checker = join(repo, "scripts/check-lint-directives.mjs");

/** @typedef {Readonly<{code: string | undefined; message?: string; filename: string; line: number; column: number}>} Finding */
/** @typedef {Readonly<{name: string; file: string; source: string; expected: readonly Finding[]; declarations?: Readonly<Record<string, string>>}>} Probe */

/** @param {string} command @param {readonly string[]} args @param {string} cwd @param {number} timeout @returns {Readonly<{status: 0 | 1; stdout: string; stderr: string}>} */
export function run(command, args, cwd, timeout = 20_000) {
  const childCommand = command === oxlint ? process.execPath : command;
  const childArgs = command === oxlint ? ["-e", "process.exit(73)"] : args;
  const result = spawnSync(childCommand, childArgs, { cwd, encoding: "utf8", timeout });
  assert.equal(result.error, undefined, `Cannot run ${command}: ${String(result.error?.message)}`);
  assert.equal(result.signal, null, `Child received ${String(result.signal)}: ${result.stderr}`);
  assert.ok(
    result.status === 0 || result.status === 1,
    `Unexpected exit ${String(result.status)}: ${result.stderr}`,
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {string} root @returns {Finding} */
function diagnostic(value, root) {
  assert.ok(isRecord(value), "Diagnostic must be an object");
  assert.equal(value.severity, "error", "Warnings are not approved negative results");
  assert.ok(
    typeof value.code === "string" ||
      (value.code === undefined &&
        value.message === "Unused oxlint-disable directive (no problems were reported)."),
    "Parser/config/unexpected uncoded diagnostics are not approved findings",
  );
  assert.ok(typeof value.filename === "string");
  assert.ok(Array.isArray(value.labels));
  /** @type {unknown} */
  const label = value.labels[0];
  assert.ok(isRecord(label) && isRecord(label.span), "Diagnostic needs a primary location");
  assert.ok(typeof label.span.line === "number");
  assert.ok(typeof label.span.column === "number");
  return {
    code: value.code,
    ...(value.code === undefined
      ? { message: "Unused oxlint-disable directive (no problems were reported)." }
      : {}),
    filename: resolve(root, value.filename),
    line: label.span.line,
    column: label.span.column,
  };
}

/** @param {ReturnType<typeof run>} result @param {string} root @param {readonly Finding[]} expected @param {number} files @returns {void} */
function compareDiagnostics(result, root, expected, files) {
  assert.equal(result.stderr, "", "Unexpected CLI/config/TypeScript stderr");
  /** @type {unknown} */
  const output = JSON.parse(result.stdout);
  assert.ok(isRecord(output), "Oxlint output must be an object");
  assert.equal(output.number_of_files, files, "The exact probe files must be linted");
  assert.ok(Array.isArray(output.diagnostics));
  const actual = output.diagnostics.map((entry) => diagnostic(entry, root));
  const wanted = expected.map((entry) => ({ ...entry, filename: resolve(root, entry.filename) }));
  const sort = (/** @type {Finding} */ left, /** @type {Finding} */ right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right));
  assert.deepEqual(
    actual.toSorted(sort),
    wanted.toSorted(sort),
    "Complete diagnostic IDs and primary locations",
  );
  assert.equal(result.status, expected.length === 0 ? 0 : 1, "Exit must agree with exact findings");
}

/** @param {ReturnType<typeof run>} result @param {string} root @param {readonly Finding[]} expected @param {number} files @returns {void} */
export function compareLint(result, root, expected, files = 1) {
  assert.ok(
    expected.every((entry) => !/^typescript\(TS\d+\)$/.test(entry.code ?? "")),
    "Compiler findings belong to the separate compiler evaluator",
  );
  compareDiagnostics(result, root, expected, files);
}

/** @param {ReturnType<typeof run>} result @param {string} root @param {readonly Finding[]} expected @param {number} files @returns {void} */
export function compareCompiler(result, root, expected, files = 1) {
  assert.ok(
    expected.every((entry) => /^typescript\(TS\d+\)$/.test(entry.code ?? "")),
    "Compiler probes must not accept lint-rule findings",
  );
  compareDiagnostics(result, root, expected, files);
}

/** @param {import("node:test").TestContext} t @param {string} file @param {string} source @param {Readonly<Record<string, string>>} declarations @returns {Promise<string>} */
export async function project(t, file, source, declarations = {}) {
  const root = await mkdtemp(join(tmpdir(), "zai-quality-config-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await symlink(join(repo, "node_modules"), join(root, "node_modules"), "dir");
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      extends: join(repo, "tsconfig.json"),
      include: [file, ...Object.keys(declarations)],
      exclude: ["node_modules"],
    }),
  );
  // Import, never reconstruct, the actual root config and all of its overrides.
  await writeFile(
    join(root, "oxlint.config.ts"),
    `import config from ${JSON.stringify(join(repo, "oxlint.config.ts"))};\nexport default config;\n`,
  );
  await Promise.all(
    Object.entries({ ...declarations, [file]: source }).map(async ([path, content]) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }),
  );
  return root;
}

/** @param {import("node:test").TestContext} t @param {Probe} probe @returns {Promise<void>} */
export async function lintProbe(t, probe) {
  const root = await project(t, probe.file, probe.source, probe.declarations);
  const result = run(
    oxlint,
    [
      "--config",
      "oxlint.config.ts",
      "--tsconfig",
      "tsconfig.json",
      "--type-aware",
      "--type-check",
      "--deny-warnings",
      "--format=json",
      probe.file,
    ],
    root,
  );
  compareLint(result, root, probe.expected);
}
