import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checker,
  compareLint,
  lintProbe,
  oxlint,
  project,
  repo,
  run,
} from "./quality-fixtures.mjs";

/** @typedef {import("./quality-fixtures.mjs").Probe} Probe */
/** @typedef {import("./quality-fixtures.mjs").Finding} Finding */

/** @param {string} code @param {number} line @param {number} column @param {string} filename @returns {Finding} */
function finding(code, line, column, filename = "src/probe.ts") {
  return { code, line, column, filename };
}

/** @param {string} name @param {string} source @param {readonly Finding[]} expected @param {string} file @returns {Probe} */
function probe(name, source, expected = [], file = "src/probe.ts") {
  return { name, source: `${source}\n`, expected, file };
}

const readonlyRule = "typescript(prefer-readonly-parameter-types)";
const floatingRule = "typescript(no-floating-promises)";

/** @type {readonly Probe[]} */
const contracts = [
  probe(
    "native lib request, URL, search parameters and promise declarations",
    `export function borrow(init: RequestInit, url: URL, query: URLSearchParams, done: Promise<void>): void {
  console.log(init, url, query, done);
}`,
  ),
  probe(
    "actual Node declarations",
    `import type { IncomingMessage, ServerResponse } from "node:http";
import type { TestContext } from "node:test";
export function borrow(request: IncomingMessage, response: ServerResponse, context: TestContext): void {
  console.log(request, response, context);
}`,
  ),
  probe(
    "actual SDK declaration",
    `import type { AgentSession } from "@earendil-works/pi-coding-agent";
export function borrow(session: AgentSession): void { console.log(session); }`,
  ),
  probe(
    "matching local names are not native allowances",
    `interface URL { value: string }
interface TestContext { value: string }
interface AgentSession { value: string }
export function borrow(url: URL, context: TestContext, session: AgentSession): void {
  console.log(url, context, session);
}`,
    [finding(readonlyRule, 4, 24), finding(readonlyRule, 4, 34), finding(readonlyRule, 4, 56)],
  ),
  probe(
    "readonly application fields retain native allowances",
    `interface ScheduledRequest {
  readonly url: URL;
  readonly init: RequestInit;
  readonly labels: Readonly<Record<string, string>>;
}
export function borrow(value: ScheduledRequest): void { console.log(value); }`,
  ),
  probe(
    "mutable application input",
    `export function borrow(value: { label: string }): void { console.log(value); }`,
    [finding(readonlyRule, 1, 24)],
  ),
  probe(
    "contextually inferred mutable callback input",
    `const values: { label: string }[] = [];
values.forEach((value) => { console.log(value.label); });`,
  ),
  probe(
    "inference does not allow unsafe callback operations",
    `declare const values: readonly any[];
values.forEach((value) => { value.run(); });`,
    [
      finding("typescript(no-explicit-any)", 1, 32),
      finding("typescript(no-unsafe-call)", 2, 29),
      finding("typescript(no-unsafe-member-access)", 2, 35),
    ],
  ),
  // ponytail: Oxlint 1.87/tsgolint 7.0.2003 falsely rejects ReadonlyMap primitives.
  // Readonly<ReadonlyMap<...>> works, but also accepts mutable maps/nested values;
  // do not call that wrapper deep immutability. Requalify on a checker upgrade.
  probe(
    "bare readonly primitive-map checker defect",
    `export function borrow(value: ReadonlyMap<string, string>): void { console.log(value); }`,
    [finding(readonlyRule, 1, 24)],
  ),
  probe(
    "readonly primitive-map compatibility spelling",
    `export function borrow(value: Readonly<ReadonlyMap<string, string>>): void { console.log(value); }`,
  ),
  probe(
    "mutable Map stays rejected",
    `export function borrow(value: Map<string, string>): void { console.log(value); }`,
    [finding(readonlyRule, 1, 24)],
  ),
  probe(
    "readonly record with mutable nested values stays rejected",
    `export function borrow(value: Readonly<Record<string, { label: string }>>): void { console.log(value); }`,
    [finding(readonlyRule, 1, 24)],
  ),
  probe(
    "wrapped mutable-map recognition ceiling",
    `export function borrow(value: Readonly<Map<string, string>>): void { console.log(value); }`,
  ),
  probe(
    "wrapped nested-map recognition ceiling",
    `export function borrow(value: Readonly<ReadonlyMap<string, { label: string }>>): void { console.log(value); }`,
  ),
  probe(
    "awaited Node registration and awaited subtest",
    `import test from "node:test";
await test("parent", async (t) => {
  await t.test("child", () => { console.log("complete"); });
});`,
    [],
    "test/probe.test.ts",
  ),
  probe(
    "unawaited Node registration is not a safe call",
    `import test from "node:test";
test("parent", () => { console.log("complete"); });`,
    [finding(floatingRule, 2, 1, "test/probe.test.ts")],
    "test/probe.test.ts",
  ),
  probe(
    "unawaited subtest is not a safe call",
    `import test from "node:test";
await test("parent", (t) => {
  t.test("child", () => { console.log("complete"); });
});`,
    [finding(floatingRule, 3, 3, "test/probe.test.ts")],
    "test/probe.test.ts",
  ),
  probe("ordinary floating promise", "Promise.resolve();", [
    finding(floatingRule, 1, 1),
    finding("promise(catch-or-return)", 1, 1),
  ]),
  probe(
    "explained sequential single-site exception",
    `export async function commit(entries: readonly Promise<void>[]): Promise<void> {
  for (const entry of entries) {
    // Each journal commit must finish before the next entry is written.
    // oxlint-disable-next-line no-await-in-loop
    await entry;
  }
}`,
  ),
  probe(
    "global await-in-loop protection",
    `export async function commit(entries: readonly Promise<void>[]): Promise<void> {
  for (const entry of entries) {
    await entry;
  }
}`,
    [finding("eslint(no-await-in-loop)", 3, 5)],
  ),
  probe(
    "nullable object presence",
    `export function present(value: Readonly<{ label: string }> | undefined): void {
  if (value) { console.log(value.label); }
}`,
  ),
  probe(
    "string truthiness",
    `export function present(value: string): void {
  if (value) { console.log("present"); }
}`,
    [finding("typescript(strict-boolean-expressions)", 2, 7)],
  ),
  probe(
    "number truthiness",
    `export function present(value: number): void {
  if (value) { console.log("present"); }
}`,
    [finding("typescript(strict-boolean-expressions)", 2, 7)],
  ),
  probe(
    "any truthiness",
    `export function present(value: any): void {
  if (value) { console.log("present"); }
}`,
    [
      finding("typescript(explicit-module-boundary-types)", 1, 25),
      finding("typescript(no-explicit-any)", 1, 32),
      finding("typescript(strict-boolean-expressions)", 2, 7),
    ],
  ),
  probe(
    "genuine void shorthand",
    `const complete: () => void = () => console.log("complete");
complete();`,
  ),
  probe(
    "nonvoid shorthand cannot implicitly discard its result",
    `const complete: () => void = () => setTimeout(() => { console.log("complete"); }, 1);
complete();`,
    [finding("typescript(strict-void-return)", 1, 36)],
  ),
  probe(
    "meaningful explicit undefined within actual test override",
    `/** @param {string | undefined} value */
function count(value) { console.log(arguments.length, value); }
count(undefined);`,
    [],
    "test/native-runtime.test.mjs",
  ),
  probe(
    "test argument exception does not disable arrow cleanup",
    `const callback = () => undefined;
console.log(callback);`,
    [finding("unicorn(no-useless-undefined)", 1, 24, "test/native-runtime.test.mjs")],
    "test/native-runtime.test.mjs",
  ),
  probe(
    "unnecessary undefined outside approved scope",
    `function count(value?: string): void { console.log(value); }
count(undefined);`,
    [finding("unicorn(no-useless-undefined)", 2, 7)],
  ),
  probe(
    "described negative type test",
    `// @ts-expect-error: This assignment must reject nonstring input.
export const wrong: string = 1;`,
    [],
    "test/contracts.test-d.ts",
  ),
  probe(
    "production compiler suppression",
    `// @ts-expect-error: This assignment must reject nonstring input.
export const wrong: string = 1;`,
    [finding("typescript(ban-ts-comment)", 1, 3)],
  ),
  probe(
    "approved owner mutation at exact boundary",
    `const values: { value: number }[] = [];
values.forEach((owner) => { owner.value = 1; });`,
    [],
    "src/index.ts",
  ),
  probe(
    "owner mutation outside boundary",
    `const values: { value: number }[] = [];
values.forEach((owner) => { owner.value = 1; });`,
    [finding("eslint(no-param-reassign)", 2, 29)],
  ),
  probe(
    "other parameter remains protected within boundary",
    `const values: { value: number }[] = [];
values.forEach((other) => { other.value = 1; });`,
    [finding("eslint(no-param-reassign)", 2, 29, "src/index.ts")],
    "src/index.ts",
  ),
  probe(
    "commented intentional no-op",
    `export function flush(): void {
  // This telemetry sink stores nothing, so flushing requires no work.
}`,
  ),
  probe("unexplained empty implementation", "export function flush(): void {}", [
    finding("eslint(no-empty-function)", 1, 31),
  ]),
];

await test("quality config: exact handwritten declaration-qualified allowance", async (t) => {
  const declaration = await readFile(join(repo, "src/servers.ts"), "utf8");
  await t.test("real ManagedServer at its actual declaration path", async (child) => {
    await lintProbe(child, {
      ...probe(
        "canonical declaration",
        `import type { ManagedServer } from "./servers.ts";
export function borrow(owner: ManagedServer): void { console.log(owner); }`,
      ),
      declarations: { "src/servers.ts": declaration },
    });
  });
  await t.test("same-name local mutable data is not an owner declaration", async (child) => {
    await lintProbe(
      child,
      probe(
        "unrelated local",
        `interface ManagedServer { value: string }
export function borrow(owner: ManagedServer): void { console.log(owner); }`,
        [finding(readonlyRule, 2, 24)],
      ),
    );
  });
});

await test("quality config: real native, type, async and semantic boundaries", async (t) => {
  await Promise.all(
    contracts.map((entry) =>
      t.test(entry.name, async (child) => {
        await lintProbe(child, entry);
      }),
    ),
  );
});

// No Vitest dependency/runner is added: this declaration supplies type information
// while the installed native plugin identifies actual Vitest imports syntactically.
const vitestDeclaration = `declare module "vitest" {
  export const test: (name: string, body: () => void) => void;
  export const expect: (value: unknown) => { readonly toBe: (value: unknown) => void };
}
`;

/** @param {string} name @param {string} body @param {readonly Finding[]} expected @returns {Probe} */
function vitestProbe(name, body, expected = []) {
  const entry = probe(
    name,
    `import { test, expect } from "vitest";
declare const result: { readonly type: string; readonly content: string };
test("case", () => {
${body}
});`,
    expected,
    "test/probe.test.ts",
  );
  return { ...entry, declarations: { "test/vitest.d.ts": vitestDeclaration } };
}

await test("quality config: installed Vitest recognition and documented Node ceiling", async (t) => {
  const file = "test/probe.test.ts";
  const entries = [
    vitestProbe("Vitest assertions recognized", '  expect(result.content).toBe("ok");'),
    {
      name: "configured assertion helper is recognized",
      file,
      expected: [],
      declarations: { "test/vitest.d.ts": vitestDeclaration },
      source: `import assert from "node:assert/strict";
import { test, expect } from "vitest";
function verifySearch(value: string): void { assert.equal(value, "ok"); }
declare const result: { readonly content: string };
test("case", () => { verifySearch(result.content); console.log(expect); });\n`,
    },
    vitestProbe(
      "assertion-free Vitest passing path rejected",
      "  console.log(result.content, expect);",
      [finding("vitest(expect-expect)", 3, 1, file)],
    ),
    vitestProbe(
      "conditional payload assertion rejected",
      '  if (result.type === "message") { expect(result.content).toBe("ok"); }',
      [finding("vitest(no-conditional-expect)", 4, 36, file)],
    ),
    vitestProbe(
      "fail-fast payload assertion",
      `  if (result.type !== "message") { throw new Error("Expected message"); }
  expect(result.content).toBe("ok");`,
    ),
    vitestProbe(
      "explained hard discriminator single-site assertion",
      `  expect(result.type).toBe("message");
  if (result.type === "message") {
    // The preceding discriminator assertion fails unless this payload branch executes.
    // oxlint-disable-next-line vitest/no-conditional-expect
    expect(result.content).toBe("ok");
  }`,
    ),
    probe(
      "Node assertion-free registration recognition ceiling, not assertion coverage",
      `import test from "node:test";
await test("case", () => { console.log("no assertion"); });`,
      [],
      file,
    ),
    probe(
      "Node conditional assertion recognition ceiling, not assertion coverage",
      `import assert from "node:assert/strict";
import test from "node:test";
declare const value: boolean;
await test("case", () => { if (value) { assert.equal(value, true); } });`,
      [],
      file,
    ),
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        await lintProbe(child, entry);
      }),
    ),
  );
});

const genericCallbackSource = `export function invoke<T>(
  // This plain callable exposes no mutable properties; T describes its result.
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types
  operation: () => T,
): T {
  return operation();
}`;

const liveGuardSource = `export async function proceedWhenActive(signal: AbortSignal, pause: Promise<void>, followOn: () => void): Promise<void> {
  if (signal.aborted) { return; }
  await pause;
  // The cancellation owner may abort this live signal while the operation is paused.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (signal.aborted) { return; }
  followOn();
}
export async function proceedWhenPresent(state: Readonly<{ deleted: boolean }>, pause: Promise<void>, followOn: () => void): Promise<void> {
  if (state.deleted) { return; }
  await pause;
  // The state owner may delete this live record while the operation is paused.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (state.deleted) { return; }
  followOn();
}`;

const controlValidatorSource = String.raw`export function containsAsciiControl(value: string): boolean {
  // This single-line field rejects ASCII C0 controls and DEL, including tabs and line breaks.
  // oxlint-disable-next-line no-control-regex
  return /[\u0000-\u001F\u007F]/u.test(value);
}`;

await test("quality config: narrowly explained checker and validator exceptions", async (t) => {
  const callbackWithoutException = genericCallbackSource.replace(
    "// oxlint-disable-next-line typescript/prefer-readonly-parameter-types",
    "",
  );
  const entries = [
    probe(
      "plain generic callback passes without suppression in the installed checker",
      callbackWithoutException,
    ),
    probe("unreproduced generic callback exception is rejected as unused", genericCallbackSource, [
      {
        code: undefined,
        message: "Unused oxlint-disable directive (no problems were reported).",
        filename: "src/probe.ts",
        line: 3,
        column: 3,
      },
    ]),
    probe(
      "mutable callback attached properties remain detectable",
      callbackWithoutException.replace("() => T,", "(() => T) & { state: number },"),
      [finding(readonlyRule, 4, 3)],
    ),
    probe(
      "other mutable inputs remain protected beside plain callable",
      callbackWithoutException
        .replace("  operation: () => T,", "  operation: () => T,\n  state: { value: string },")
        .replace("  return operation();", "  console.log(state);\n  return operation();"),
      [finding(readonlyRule, 5, 3)],
    ),
    probe(
      "unsafe body stays protected beside plain callable",
      callbackWithoutException.replace(
        "  return operation();",
        '  const value = JSON.parse("{}");\n  console.log(value.label);\n  return operation();',
      ),
      [
        finding("typescript(no-unsafe-assignment)", 6, 17),
        finding("typescript(no-unsafe-member-access)", 7, 21),
      ],
    ),
    probe(
      "live post-await cancellation and deletion guard defect without suppression",
      liveGuardSource.replaceAll(
        "// oxlint-disable-next-line typescript/no-unnecessary-condition",
        "",
      ),
      [
        finding("typescript(no-unnecessary-condition)", 6, 7),
        finding("typescript(no-unnecessary-condition)", 14, 7),
      ],
    ),
    probe("live post-await guards with exact explained exceptions", liveGuardSource),
    probe(
      "genuine nearby constant condition remains detectable",
      liveGuardSource.replace("  followOn();", "  if (signal.aborted) { return; }\n  followOn();"),
      [finding("typescript(no-unnecessary-condition)", 7, 7)],
    ),
    probe("visibly escaped validator with exact exception", controlValidatorSource),
    probe(
      "unexcepted nearby control regex remains detectable",
      `${controlValidatorSource}\nexport const accidental = /\\u0000/u;`,
      [finding("eslint(no-control-regex)", 6, 28)],
    ),
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        await lintProbe(child, entry);
      }),
    ),
  );
});

await test("live guard fixture: pause, interrupt and resume without protocol claims", async (t) => {
  const root = await project(t, "src/guards.ts", `${liveGuardSource}\n`);
  const driver = `import assert from "node:assert/strict";
import { proceedWhenActive, proceedWhenPresent } from "./src/guards.ts";
for (const interrupt of [false, true]) {
  const pause = Promise.withResolvers();
  const controller = new AbortController();
  let followed = 0;
  const pending = proceedWhenActive(controller.signal, pause.promise, () => { followed += 1; });
  assert.equal(followed, 0, "follow-on work waits for the paused operation");
  if (interrupt) { controller.abort(); }
  pause.resolve();
  await pending;
  assert.equal(followed, interrupt ? 0 : 1, "live cancellation is reread after await");
}
for (const interrupt of [false, true]) {
  const pause = Promise.withResolvers();
  const state = { deleted: false };
  let followed = 0;
  const pending = proceedWhenPresent(state, pause.promise, () => { followed += 1; });
  assert.equal(followed, 0, "follow-on work waits for the paused operation");
  if (interrupt) { state.deleted = true; }
  pause.resolve();
  await pending;
  assert.equal(followed, interrupt ? 0 : 1, "live deletion is reread after await");
}
console.log("live guard paths verified");`;
  const result = run(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", driver],
    root,
  );
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "live guard paths verified\n");
});

await test("control validator fixture: rejected C0/DEL and accepted printable/Unicode inputs", async (t) => {
  const root = await project(t, "src/validator.ts", `${controlValidatorSource}\n`);
  const driver = String.raw`import assert from "node:assert/strict";
import { containsAsciiControl } from "./src/validator.ts";
for (const value of ["", "ordinary text", "café🙂", "\u0020", "\u007e", "\u0080"]) {
  assert.equal(containsAsciiControl(value), false, "legitimate text remains accepted");
}
for (const value of ["\u0000", "\r", "\n", "\t", "\u001f", "\u007f"]) {
  assert.equal(containsAsciiControl(value), true, "prohibited boundary character is detected");
  assert.equal(containsAsciiControl("before" + value + "after"), true, "embedded control is detected");
}
console.log("control validator inputs verified");`;
  const result = run(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", driver],
    root,
  );
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "control validator inputs verified\n");
});

/** @param {string} parameters @param {string} body @param {string | undefined} jsdoc @returns {string} */
function workSource(parameters, body, jsdoc) {
  const prefix = jsdoc === undefined ? "" : `/** ${jsdoc} @returns {void} */\n`;
  const returns = jsdoc === undefined ? ": void" : "";
  return `${prefix}export function work(${parameters})${returns} {\n${body}}`;
}

/** @param {string} metric @param {number} limit @param {boolean} javascript @returns {string} */
function metricSource(metric, limit, javascript = false) {
  if (metric === "max-params") {
    const names = Array.from({ length: limit }, (_, index) => `arg${index}`);
    const parameters = names.map((name) => (javascript ? name : `${name}: boolean`)).join(", ");
    const jsdoc = javascript
      ? names.map((name) => `@param {boolean} ${name}`).join(" ")
      : undefined;
    return workSource(parameters, `  console.log(${names.join(", ")});\n`, jsdoc);
  }
  if (metric === "max-statements") {
    return workSource("", '  console.log("work");\n'.repeat(limit), javascript ? "" : undefined);
  }
  if (metric === "max-lines-per-function") {
    return workSource(
      "",
      `  console.log(\n${'    "work",\n'.repeat(limit - 4)}  );\n`,
      javascript ? "" : undefined,
    );
  }
  if (metric === "max-lines") {
    return 'console.log("work");\n'.repeat(limit);
  }
  if (metric === "max-depth") {
    const types = Array.from({ length: limit }, () => "boolean").join(", ");
    const branches = Array.from({ length: limit }, (_, index) => `  if (flags[${index}]) {\n`).join(
      "",
    );
    return workSource(
      javascript ? "flags" : `flags: readonly [${types}]`,
      `${branches}    console.log("work");\n${"  }\n".repeat(limit)}`,
      javascript ? `@param {readonly [${types}]} flags` : undefined,
    );
  }
  return workSource(
    javascript ? "flag" : "flag: boolean",
    '  if (flag) { console.log("work"); }\n'.repeat(limit - 1),
    javascript ? "@param {boolean} flag" : undefined,
  );
}

await test("quality config: exact production and test complexity ceilings", async (t) => {
  const metrics = [
    { name: "complexity", production: 10, tests: 15, line: 1, column: 8 },
    { name: "max-depth", production: 3, tests: 4, line: 5, column: 3 },
    { name: "max-params", production: 4, tests: 6, line: 1, column: 21 },
    { name: "max-statements", production: 40, tests: null, line: 1, column: 8 },
    { name: "max-lines-per-function", production: 80, tests: null, line: 1, column: 8 },
    { name: "max-lines", production: 500, tests: null, line: 501, column: 1 },
  ];
  await Promise.all(
    metrics.flatMap((metric) =>
      [
        "src/probe.ts",
        "test/probe.test.ts",
        "test/quality-fixtures.mjs",
        "test/contracts.test-d.ts",
      ].map(async (file) => {
        const production = file === "src/probe.ts";
        const javascript = file.endsWith(".mjs");
        if (!production && metric.tests === null) {
          await t.test(`${file} ${metric.name} is disabled`, async (child) => {
            await lintProbe(
              child,
              probe(
                "cohesive large test",
                metricSource(metric.name, metric.production * 3, javascript),
                [],
                file,
              ),
            );
          });
          return;
        }
        const limit = production ? metric.production : (metric.tests ?? 0);
        await t.test(`${file} ${metric.name} at limit`, async (child) => {
          await lintProbe(
            child,
            probe("at limit", metricSource(metric.name, limit, javascript), [], file),
          );
        });
        await t.test(`${file} ${metric.name} over limit`, async (child) => {
          const primaryLine = ["max-depth", "max-lines"].includes(metric.name)
            ? limit + 2
            : metric.line;
          const line = javascript ? primaryLine + 1 : primaryLine;
          await lintProbe(
            child,
            probe(
              "over limit",
              metricSource(metric.name, limit + 1, javascript),
              [finding(`eslint(${metric.name})`, line, metric.column, file)],
              file,
            ),
          );
        });
      }),
    ),
  );
});

await test("comment policy: real CLI distinguishes comments from literals and documentation", async (t) => {
  const root = await project(
    t,
    "src/probe.ts",
    `export const example = "// oxlint-disable";
export const template = \`// @ts-ignore\`;
export const pattern = /oxlint-disable/;
/** Documentation example: oxlint-disable-next-line no-debugger is forbidden. */
// The words @ts-nocheck in documentation are not a directive.
`,
  );
  const result = run(process.execPath, [checker, "src/probe.ts"], root);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

const policyReason = /Only documented single-site .*exceptions are approved\./;
const typeReason =
  /Compiler suppressions require a described @ts-expect-error.*dedicated \*\.test-d\.ts type test\./;
const multilineReason =
  /Lint directives must use a single-line comment; continuation lines can hide extra rules\./;

await test("comment policy: exact approved sites and forbidden suppression forms", async (t) => {
  /** @type {readonly Readonly<{name: string; comment: string; file: string; reason: RegExp | ""; line?: number}>[]} */
  const entries = [
    {
      name: "adjacent sequential reason",
      comment:
        "// Each journal commit must finish before the next entry is written.\n// oxlint-disable-next-line no-await-in-loop",
      file: "src/probe.ts",
      reason: "",
    },
    {
      name: "single-line block directive with adjacent reason",
      comment:
        "// Each journal commit must finish before the next entry is written.\n/* oxlint-disable-next-line no-await-in-loop */",
      file: "src/probe.ts",
      reason: "",
    },
    {
      name: "multiline adjacent explanation is not a multiline directive",
      comment:
        "/* Each journal commit must finish before the next entry is written.\n * Concurrent writes would reorder the durable journal. */\n// oxlint-disable-next-line no-await-in-loop",
      file: "src/probe.ts",
      reason: "",
    },
    {
      name: "multiline block hides an unapproved second rule",
      comment:
        "// Each journal commit must finish before the next entry is written.\n/* oxlint-disable-next-line no-await-in-loop\n no-debugger */",
      file: "src/probe.ts",
      reason: multilineReason,
      line: 2,
    },
    {
      name: "multiline block hides an approved second rule",
      comment:
        "// Each journal commit must finish before the next entry is written.\n/* oxlint-disable-next-line no-await-in-loop\n no-control-regex */",
      file: "src/probe.ts",
      reason: multilineReason,
      line: 2,
    },
    {
      name: "multiline directive is forbidden even without a second rule",
      comment:
        "// Each journal commit must finish before the next entry is written.\n/* oxlint-disable-next-line no-await-in-loop\n */",
      file: "src/probe.ts",
      reason: multilineReason,
      line: 2,
    },
    {
      name: "inline fail-closed reason",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes skipped payload validation fail closed.",
      file: "test/probe.test.ts",
      reason: "",
    },
    {
      name: "generic callable structural approval",
      comment:
        "// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- This plain callable exposes no mutable properties; T describes its result.",
      file: "src/probe.ts",
      reason: "",
    },
    {
      name: "live post-await guard structural approval",
      comment:
        "// oxlint-disable-next-line typescript/no-unnecessary-condition -- The cancellation owner may abort this live signal while persistence is paused.",
      file: "src/probe.ts",
      reason: "",
    },
    {
      name: "intentional escaped validator structural approval",
      comment:
        "// oxlint-disable-next-line no-control-regex -- This field rejects ASCII C0 controls and DEL at its validation boundary.",
      file: "src/probe.ts",
      reason: "",
    },
    {
      name: "same-line directive is not approved",
      comment:
        "// oxlint-disable-line no-await-in-loop -- Journal commits require the previous write to finish.",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "conditional assertion rejected in production",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes payload validation fail closed.",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "conditional assertion recognized in spec files",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes payload validation fail closed.",
      file: "test/probe.spec.ts",
      reason: "",
    },
    {
      name: "conditional assertion recognized in __tests__",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes payload validation fail closed.",
      file: "src/__tests__/probe.ts",
      reason: "",
    },
    {
      name: "conditional assertion recognized in exact smoke owner",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes payload validation fail closed.",
      file: "scripts/smoke.mjs",
      reason: "",
    },
    {
      name: "conditional assertion recognized in exact offline fixture",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes payload validation fail closed.",
      file: "test/fixtures/vision-offline.mjs",
      reason: "",
    },
    {
      name: "conditional assertion not globally allowed in test directory",
      comment:
        "// oxlint-disable-next-line vitest/no-conditional-expect -- The hard discriminator assertion makes payload validation fail closed.",
      file: "test/arbitrary.mjs",
      reason: policyReason,
    },
    {
      name: "typed extension not a dedicated type-test scope",
      comment: "// @ts-expect-error: This assignment must reject nonstring input.",
      file: "test/contracts.test-d.mts",
      reason: typeReason,
    },
    { name: "blanket", comment: "// oxlint-disable", file: "src/probe.ts", reason: policyReason },
    {
      name: "multirule",
      comment:
        "// oxlint-disable-next-line no-await-in-loop, no-debugger -- Journal commits are sequential.",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "unapproved unsafe rule",
      comment:
        "// oxlint-disable-next-line typescript/no-unsafe-call -- This operation belongs to the owner.",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "missing explanation",
      comment: "// oxlint-disable-next-line no-await-in-loop",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "vacuous explanation",
      comment: "// oxlint-disable-next-line no-await-in-loop -- intentionally disabled",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "nonadjacent explanation",
      comment:
        "// Journal commits require previous writes to finish.\n\n\n// oxlint-disable-next-line no-await-in-loop",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "inline oxlint downgrade",
      comment: '/* oxlint no-debugger: "off" */',
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "inline eslint downgrade",
      comment: '/* eslint no-debugger: "off" */',
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "eslint single-site",
      comment: "// eslint-disable-next-line no-await-in-loop -- Journal commits are sequential.",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "reenable does not legitimize blanket",
      comment: "// oxlint-enable no-await-in-loop",
      file: "src/probe.ts",
      reason: policyReason,
    },
    {
      name: "multiline block compiler directive",
      comment: "/**\n * @ts-ignore: Described compiler escapes remain forbidden.\n */",
      file: "src/probe.ts",
      reason: typeReason,
      line: 2,
    },
    {
      name: "ts-ignore",
      comment: "// @ts-ignore: A described compiler escape is still forbidden.",
      file: "src/probe.ts",
      reason: typeReason,
    },
    {
      name: "compiler-recognized ts-ignore suffix",
      comment: "// @ts-ignoreSuffix",
      file: "src/probe.ts",
      reason: typeReason,
    },
    {
      name: "compiler-recognized ts-nocheck suffix",
      comment: "// @ts-nocheck_suffix",
      file: "src/probe.ts",
      reason: typeReason,
    },
    {
      name: "noncanonical expect-error suffix is not a dedicated type-test allowance",
      comment: "// @ts-expect-errorSuffix: This assignment must reject nonstring input.",
      file: "test/contracts.test-d.ts",
      reason: typeReason,
    },
    {
      name: "ts-nocheck",
      comment: "// @ts-nocheck",
      file: "test/contracts.test-d.ts",
      reason: typeReason,
    },
    {
      name: "production expect-error",
      comment: "// @ts-expect-error: This assignment must reject nonstring input.",
      file: "src/probe.ts",
      reason: typeReason,
    },
    {
      name: "ordinary test expect-error",
      comment: "// @ts-expect-error: This assignment must reject nonstring input.",
      file: "test/probe.test.ts",
      reason: typeReason,
    },
    {
      name: "undescribed type-test error",
      comment: "// @ts-expect-error",
      file: "test/contracts.test-d.ts",
      reason: typeReason,
    },
    {
      name: "short type-test explanation",
      comment: "// @ts-expect-error: short",
      file: "test/contracts.test-d.ts",
      reason: typeReason,
    },
    {
      name: "described dedicated type-test error",
      comment: "// @ts-expect-error: This assignment must reject nonstring input.",
      file: "test/contracts.test-d.ts",
      reason: "",
    },
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        const root = await project(
          child,
          entry.file,
          `${entry.comment}\nexport const value = 1;\n`,
        );
        const result = run(process.execPath, [checker, entry.file], root);
        assert.equal(result.stdout, "");
        assert.equal(result.status, entry.reason === "" ? 0 : 1);
        const line = entry.line ?? entry.comment.split("\n").length;
        if (entry.reason === "") {
          assert.equal(result.stderr, "");
          return;
        }
        const prefix = `${entry.file}:${line}: `;
        assert.ok(result.stderr.startsWith(prefix), "Exact primary policy filename and line");
        assert.equal(result.stderr.trimEnd().split("\n").length, 1, "Exactly one policy finding");
        assert.match(
          result.stderr.slice(prefix.length),
          entry.reason,
          "Policy category, not an unrelated parser/process failure",
        );
      }),
    ),
  );
});

await test("comment policy rejects actual native multiline suppressions that silence strict lint", async (t) => {
  const entries = [
    {
      name: "debugger hidden after approved sequencing rule",
      rules: "no-debugger",
      statement: "debugger; await entry;",
      findings: [finding("eslint(no-debugger)", 6, 5), finding("eslint(no-await-in-loop)", 6, 15)],
    },
    {
      name: "core promise protection hidden after approved sequencing rule",
      rules: "typescript/no-floating-promises promise/catch-or-return",
      statement: "Promise.resolve(await entry);",
      findings: [
        finding(floatingRule, 6, 5),
        finding("promise(catch-or-return)", 6, 5),
        finding("eslint(no-await-in-loop)", 6, 21),
      ],
    },
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        const directive = `/* oxlint-disable-next-line no-await-in-loop\n     ${entry.rules} */`;
        const source = `export async function commit(entries: readonly Promise<string>[]): Promise<void> {
  for (const entry of entries) {
    // Each journal commit must finish before the next entry is written.
    ${directive}
    ${entry.statement}
  }
}\n`;
        const root = await project(child, "src/probe.ts", source);
        const args = ["--config", "oxlint.config.ts", "--format=json", "src/probe.ts"];
        // The installed native CLI really consumes both continuation rules.
        compareLint(run(oxlint, args, root), root, []);
        await writeFile(join(root, "src/probe.ts"), source.replace(directive, "\n"));
        compareLint(run(oxlint, args, root), root, entry.findings);
        await writeFile(join(root, "src/probe.ts"), source);
        const policy = run(process.execPath, [checker, "src/probe.ts"], root);
        assert.equal(policy.status, 1);
        assert.equal(policy.stdout, "");
        assert.equal(
          policy.stderr,
          "src/probe.ts:4: Lint directives must use a single-line comment; continuation lines can hide extra rules.\n",
        );
      }),
    ),
  );
});

await test("comment policy fails closed on invalid source", async (t) => {
  const root = await project(t, "src/probe.ts", "const = ;\n");
  const result = run(process.execPath, [checker, "src/probe.ts"], root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "src/probe.ts: Cannot inspect directives in invalid source: Unexpected token\n",
  );
});

await test("negative-probe evaluator rejects unrelated compiler, module, parser and config failures", async (t) => {
  const entries = [
    {
      name: "compiler error",
      source: "export const value: string = 1;",
      error: /Complete diagnostic IDs and primary locations/,
    },
    {
      name: "missing module",
      source: 'import value from "package-that-does-not-exist"; console.log(value);',
      error: /Complete diagnostic IDs and primary locations/,
    },
    {
      name: "parser error",
      source: "const = ;",
      error: /Parser\/config\/unexpected uncoded diagnostics are not approved findings/,
    },
  ];
  await Promise.all(
    entries.map((entry) =>
      t.test(entry.name, async (child) => {
        const root = await project(child, "src/probe.ts", `${entry.source}\n`);
        const result = run(
          oxlint,
          [
            "--config",
            "oxlint.config.ts",
            "--tsconfig",
            "tsconfig.json",
            "--format=json",
            "src/probe.ts",
          ],
          root,
        );
        assert.throws(() => compareLint(result, root, [finding(floatingRule, 1, 1)]), entry.error);
      }),
    ),
  );
  const root = await project(t, "src/probe.ts", "export const value = 1;\n");
  const configFailure = run(
    oxlint,
    ["--config", "missing-config.json", "--format=json", "src/probe.ts"],
    root,
  );
  assert.match(configFailure.stdout, /^Failed to parse oxlint configuration file\./);
  assert.throws(() => compareLint(configFailure, root, [finding(floatingRule, 1, 1)]), SyntaxError);
});

await test("negative-probe evaluator rejects non-policy failures", async (t) => {
  const root = await project(t, "src/probe.ts", "export const value = 1;\n");
  assert.throws(
    () => run(process.execPath, ["-e", "process.exit(73)"], root),
    /Unexpected exit 73/,
  );
  assert.throws(
    () => run(process.execPath, ["-e", 'process.kill(process.pid, "SIGTERM")'], root),
    /Child received SIGTERM/,
  );
  assert.throws(
    () => run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], root, 100),
    /Cannot run/,
  );
  assert.throws(() => run(join(root, "missing-executable"), [], root), /Cannot run/);
  const invalid = run(process.execPath, ["-e", 'console.log("not JSON")'], root);
  assert.throws(() => compareLint(invalid, root, []), SyntaxError);
  const noFiles = run(
    oxlint,
    ["--config", join(repo, "oxlint.config.ts"), "--format=json", "missing.ts"],
    root,
  );
  assert.match(noFiles.stdout, /^No files found to lint\./);
  assert.throws(() => compareLint(noFiles, root, []), SyntaxError);
});
