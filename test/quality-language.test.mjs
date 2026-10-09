import assert from "node:assert/strict";
import test from "node:test";
import { glob, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  checker,
  compareCompiler,
  compareLint,
  oxlint,
  project,
  repo,
  run,
} from "./quality-fixtures.mjs";

/** @typedef {import("./quality-fixtures.mjs").Finding} Finding */
const tsc = join(repo, "node_modules/.bin/tsc");
const floating = "typescript(no-floating-promises)";
const promiseSource =
  'import test from "node:test";\ntest("case", () => { console.log("complete"); });\n';
const compilerSource = '/** @type {number} */\nexport const value = "bad";\n';

/** @param {string} code @param {string} filename @param {number} line @param {number} column @returns {Finding} */
function finding(code, filename, line, column) {
  return { code, filename, line, column };
}

// Only disposable projects need unchecked scopes. Classify installed rules by
// metadata, not namespace: syntactic TypeScript and Promise rules must survive.
const metadataResult = run(oxlint, ["--rules", "--format=json"], repo);
assert.equal(metadataResult.status, 0);
assert.equal(metadataResult.stderr, "");
/** @type {unknown} */
const metadata = JSON.parse(metadataResult.stdout);
assert.ok(Array.isArray(metadata) && metadata.length > 0);
const uncheckedRules = Object.fromEntries(
  metadata.flatMap((/** @type {unknown} */ entry) => {
    assert.ok(typeof entry === "object" && entry !== null);
    assert.ok("scope" in entry && typeof entry.scope === "string");
    assert.ok("value" in entry && typeof entry.value === "string");
    assert.ok("type_aware" in entry && typeof entry.type_aware === "boolean");
    return entry.type_aware ? [[`${entry.scope}/${entry.value}`, "off"]] : [];
  }),
);
assert.equal(uncheckedRules["typescript/no-floating-promises"], "off");
assert.equal(Object.hasOwn(uncheckedRules, "typescript/ban-ts-comment"), false);

/** @param {import("node:test").TestContext} t @param {string} file @param {string} source @param {Readonly<{checkJs?: boolean; unchecked?: readonly string[]; declarations?: Readonly<Record<string, string>>}>} options @returns {Promise<string>} */
async function languageProject(t, file, source, options = {}) {
  const declarations = options.declarations ?? {};
  const root = await project(t, file, source, declarations);
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      extends: join(repo, "tsconfig.json"),
      ...(options.checkJs === undefined ? {} : { compilerOptions: { checkJs: options.checkJs } }),
      // Declaration stubs are roots; dependency JS must enter through its real import.
      include: [file, ...Object.keys(declarations).filter((path) => path.endsWith(".d.ts"))],
      exclude: ["node_modules"],
    }),
  );
  if (options.unchecked !== undefined) {
    await writeFile(
      join(root, "oxlint.config.ts"),
      `import config from ${JSON.stringify(join(repo, "oxlint.config.ts"))};
export default { ...config, overrides: [...config.overrides, {
  files: ${JSON.stringify(options.unchecked)}, rules: ${JSON.stringify(uncheckedRules)}
}] };\n`,
    );
  }
  return root;
}

/** @param {string} root @param {readonly string[]} files @returns {ReturnType<typeof run>} */
function lint(root, files) {
  return run(oxlint, ["--config", "oxlint.config.ts", "--format=json", ...files], root);
}

await test("language scope: maintained inventory matches actual lint and compiler graph; unchecked scope is empty", async () => {
  const inventory = [];
  for await (const path of glob("**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}", {
    cwd: repo,
    exclude: ["node_modules/**", ".git/**"],
  })) {
    inventory.push(resolve(repo, path));
  }
  const projects = [];
  for await (const path of glob("**/{tsconfig,jsconfig}.json", {
    cwd: repo,
    exclude: ["node_modules/**", ".git/**"],
  })) {
    projects.push(path);
  }
  assert.deepEqual(
    projects,
    ["tsconfig.json"],
    "New project scope must qualify effective checking and assignment",
  );
  const debug = run(oxlint, ["--config", "oxlint.config.ts", "--debug=files", "."], repo);
  assert.equal(debug.status, 0);
  assert.equal(debug.stderr, "");
  const linted = debug.stdout
    .trim()
    .split("\n")
    .map((path) => resolve(repo, path));
  assert.ok(inventory.length > 0);
  assert.deepEqual(
    linted.toSorted(),
    inventory.toSorted(),
    "Every maintained source remains linted",
  );
  const config = run(tsc, ["--showConfig"], repo);
  assert.equal(config.status, 0);
  assert.equal(config.stderr, "");
  /** @type {unknown} */
  const effective = JSON.parse(config.stdout);
  assert.ok(typeof effective === "object" && effective !== null && "compilerOptions" in effective);
  const options = effective.compilerOptions;
  assert.ok(typeof options === "object" && options !== null);
  for (const setting of [
    "allowJs",
    "checkJs",
    "strict",
    "noImplicitReturns",
    "noUncheckedIndexedAccess",
  ]) {
    assert.ok(
      setting in options && Reflect.get(options, setting) === true,
      `Effective ${setting} must remain enabled`,
    );
  }
  const compiler = run(tsc, ["--listFilesOnly", "--pretty", "false"], repo);
  assert.equal(compiler.status, 0);
  assert.equal(compiler.stderr, "");
  const program = compiler.stdout
    .trim()
    .split("\n")
    .map((path) => resolve(repo, path));
  // Linked host dependencies resolve outside the repo; only owned files join the inventory.
  const maintainedProgram = program.filter((path) => {
    const local = relative(repo, path);
    return (
      !isAbsolute(local) &&
      local !== ".." &&
      !local.startsWith(`..${sep}`) &&
      !local.startsWith(`node_modules${sep}`)
    );
  });
  assert.deepEqual(
    maintainedProgram.toSorted(),
    inventory.toSorted(),
    "Actual program retains every linted source, including JavaScript imports",
  );
  const policy = run(process.execPath, [checker], repo);
  assert.equal(
    policy.status,
    0,
    "Per-file compiler escapes cannot downgrade the all-checked scope",
  );
  assert.equal(policy.stdout, "");
  assert.equal(policy.stderr, "");
});

await test("language scope: semantic lint follows effective checking and exact unchecked overrides", async (t) => {
  const entries = [
    { name: "unchecked js", file: "src/probe.js", checkJs: false, unchecked: true },
    { name: "unchecked mjs", file: "src/probe.mjs", checkJs: false, unchecked: true },
    { name: "unchecked cjs", file: "src/probe.cjs", checkJs: false, unchecked: true },
    { name: "TypeScript", file: "src/probe.ts", checkJs: false },
    { name: "checked JavaScript", file: "src/probe.mjs", checkJs: true },
    {
      name: "ts-check under checkJs false",
      file: "src/probe.mjs",
      checkJs: false,
      directive: true,
    },
    { name: "inherited checkJs true", file: "src/probe.mjs" },
    { name: "checked test override", file: "test/probe.test.mjs", checkJs: true },
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        const source = entry.file.endsWith(".cjs")
          ? promiseSource.replace(
              'import test from "node:test";',
              'const test = require("node:test");',
            )
          : promiseSource;
        const root = await languageProject(
          child,
          entry.file,
          `${entry.directive === true ? "// @ts-check\n" : ""}${source}`,
          {
            ...(entry.checkJs === undefined ? {} : { checkJs: entry.checkJs }),
            ...(entry.unchecked === true ? { unchecked: [entry.file] } : {}),
          },
        );
        compareLint(
          lint(root, [entry.file]),
          root,
          entry.unchecked === true
            ? []
            : [finding(floating, entry.file, entry.directive === true ? 3 : 2, 1)],
        );
        const compiler = run(tsc, ["--noEmit", "--pretty", "false"], root);
        assert.equal(compiler.status, 0, "Semantic lint example is not a compiler failure");
        assert.equal(compiler.stdout, "");
        assert.equal(compiler.stderr, "");
      }),
    ),
  );
});

await test("language scope: unchecked files retain ordinary and test checks without semantic re-enable", async (t) => {
  const file = "test/probe.test.mjs";
  const entries = [
    {
      name: "ordinary unchecked JS syntax",
      file: "src/probe.js",
      source: "debugger;\n",
      expected: [finding("eslint(no-debugger)", "src/probe.js", 1, 1)],
    },
    {
      name: "unchecked test syntax and floating outside scope",
      file,
      source: `${promiseSource}debugger;\n`,
      expected: [finding("eslint(no-debugger)", file, 3, 1)],
    },
    {
      name: "test override cannot re-enable semantic constant analysis",
      file,
      source: 'if (true) { console.log("work"); }\n',
      expected: [finding("eslint(no-constant-condition)", file, 1, 5)],
    },
    {
      name: "syntactic Promise protection",
      file,
      source: "Promise.resolve();\n",
      expected: [finding("promise(catch-or-return)", file, 1, 1)],
    },
    {
      name: "applicable assertion-free Vitest test fails",
      file,
      source: 'import { test } from "vitest";\ntest("case", () => { console.log("complete"); });\n',
      expected: [finding("vitest(expect-expect)", file, 2, 1)],
      declarations: {
        "test/vitest.d.ts":
          'declare module "vitest" { export const test: (name: string, body: () => void) => void; }\n',
      },
    },
    ...[15, 16].map((complexity) => ({
      name: `unchecked test complexity ${complexity}`,
      file,
      source: `/** @param {boolean} flag */\nexport function work(flag) {\n${'  if (flag) { console.log("work"); }\n'.repeat(complexity - 1)}}\n`,
      expected: complexity === 15 ? [] : [finding("eslint(complexity)", file, 2, 8)],
    })),
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        const root = await languageProject(child, entry.file, entry.source, {
          checkJs: false,
          unchecked: [entry.file],
          ...(entry.declarations === undefined ? {} : { declarations: entry.declarations }),
        });
        compareLint(lint(root, [entry.file]), root, entry.expected);
      }),
    ),
  );
});

await test("language scope: unsafe unchecked import retains consumer-side semantic protection", async (t) => {
  const file = "src/probe.ts";
  const boundary = "src/boundary.mjs";
  const root = await languageProject(
    t,
    file,
    'import { boundary } from "./boundary.mjs";\nconst value: number = boundary;\nconsole.log(value);\n',
    {
      checkJs: false,
      unchecked: [boundary],
      declarations: { [boundary]: 'export const boundary = JSON.parse("{}");\n' },
    },
  );
  compareLint(
    lint(root, [file, boundary]),
    root,
    [finding("typescript(no-unsafe-assignment)", file, 2, 23)],
    2,
  );
  const compiler = run(tsc, ["--noEmit", "--pretty", "false"], root);
  assert.equal(compiler.status, 0);
  assert.equal(compiler.stdout, "");
  assert.equal(compiler.stderr, "");
});

await test("language scope: compiler diagnostics are independent of lint-rule diagnostics", async (t) => {
  const entries = [
    {
      name: "unchecked compiler outside scope",
      file: "src/probe.mjs",
      checkJs: false,
      unchecked: true,
    },
    { name: "checked JS compiler", file: "src/probe.mjs", checkJs: true },
    {
      name: "ts-check compiler under checkJs false",
      file: "src/probe.mjs",
      checkJs: false,
      directive: true,
    },
    { name: "inherited compiler checking", file: "src/probe.mjs" },
    { name: "TypeScript compiler remains checked", file: "src/probe.ts", checkJs: false },
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        const source = entry.file.endsWith(".ts")
          ? 'export const value: number = "bad";\n'
          : compilerSource;
        const line = (entry.file.endsWith(".ts") ? 1 : 2) + (entry.directive === true ? 1 : 0);
        const root = await languageProject(
          child,
          entry.file,
          `${entry.directive === true ? "// @ts-check\n" : ""}${source}`,
          {
            ...(entry.checkJs === undefined ? {} : { checkJs: entry.checkJs }),
            ...(entry.unchecked === true ? { unchecked: [entry.file] } : {}),
          },
        );
        const expected =
          entry.unchecked === true ? [] : [finding("typescript(TS2322)", entry.file, line, 14)];
        compareCompiler(lint(root, [entry.file]), root, expected);
        const compiler = run(tsc, ["--noEmit", "--pretty", "false"], root);
        assert.equal(compiler.status, entry.unchecked === true ? 0 : 1);
        assert.equal(compiler.stderr, "");
        assert.equal(
          compiler.stdout,
          entry.unchecked === true
            ? ""
            : `${entry.file}(${line},14): error TS2322: Type 'string' is not assignable to type 'number'.\n`,
        );
      }),
    ),
  );
});

await test("language scope: compiler sees imported unchecked JS but reports only the checked TS consumer", async (t) => {
  const file = "src/probe.ts";
  const boundary = "src/boundary.mjs";
  const root = await languageProject(
    t,
    file,
    'import { value } from "./boundary.mjs";\nexport const consumer: string = value;\n',
    {
      checkJs: false,
      unchecked: [boundary],
      declarations: { [boundary]: compilerSource },
    },
  );
  compareCompiler(
    lint(root, [file, boundary]),
    root,
    [finding("typescript(TS2322)", file, 2, 14)],
    2,
  );
  const compiler = run(tsc, ["--noEmit", "--pretty", "false"], root);
  assert.equal(compiler.status, 1);
  assert.equal(compiler.stderr, "");
  assert.equal(
    compiler.stdout,
    "src/probe.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.\n",
  );
  const graph = run(tsc, ["--listFilesOnly", "--pretty", "false"], root);
  assert.equal(graph.status, 0);
  assert.equal(graph.stderr, "");
  assert.ok(
    graph.stdout.split("\n").includes(await realpath(join(root, boundary))),
    "Unchecked JS stays in the actual imported program graph",
  );
});
