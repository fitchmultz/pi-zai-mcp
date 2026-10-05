import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "promise", "vitest"],
  categories: {
    correctness: "error", suspicious: "error", perf: "error",
    pedantic: "off", style: "off", restriction: "off", nursery: "off",
  },
  options: {
    typeAware: true, typeCheck: true, denyWarnings: true,
    reportUnusedDisableDirectives: "error", respectEslintDisableDirectives: false,
  },
  rules: {
    "unicorn/no-abusive-eslint-disable": "error",
    "typescript/ban-ts-comment": ["error", {
      "ts-check": false, "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true,
    }],
    "no-warning-comments": ["error", { terms: ["todo", "fixme", "xxx", "hack"], location: "anywhere" }],
    "typescript/no-explicit-any": ["error", { fixToUnknown: false, ignoreRestArgs: false }],
    "typescript/no-non-null-assertion": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/no-unnecessary-type-assertion": ["error", { checkLiteralConstAssertions: true }],
    "typescript/consistent-type-assertions": ["error", {
      assertionStyle: "as", objectLiteralTypeAssertions: "never", arrayLiteralTypeAssertions: "never",
    }],
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-floating-promises": ["error", { checkThenables: true, ignoreIIFE: false, ignoreVoid: false }],
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/require-await": "off",
    "typescript/return-await": ["error", "error-handling-correctness-only"],
    "typescript/strict-void-return": "error",
    "typescript/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
    "typescript/no-meaningless-void-operator": "error",
    "promise/always-return": "error",
    "promise/catch-or-return": "error",
    "typescript/prefer-promise-reject-errors": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-unnecessary-condition": ["error", { checkTypePredicates: true, allowConstantLoopConditions: "only-allowed-literals" }],
    "typescript/strict-boolean-expressions": ["error", {
      allowAny: false, allowNullableBoolean: false, allowNullableEnum: false,
      allowNullableNumber: false, allowNullableObject: true, allowNullableString: false,
      allowNumber: false, allowString: false,
    }],
    "typescript/restrict-plus-operands": ["error", {
      allowAny: false, allowBoolean: false, allowNullish: false,
      allowNumberAndString: false, allowRegExp: false, skipCompoundAssignments: false,
    }],
    "typescript/restrict-template-expressions": ["error", {
      allowAny: false, allowArray: false, allowBoolean: true, allowNever: false,
      allowNullish: false, allowNumber: true, allowRegExp: false,
    }],
    "typescript/no-base-to-string": ["error", { checkUnknown: true }],
    "typescript/no-deprecated": "error",
    "typescript/use-unknown-in-catch-callback-variable": "error",
    "typescript/only-throw-error": ["error", { allowThrowingAny: false, allowThrowingUnknown: false }],
    "typescript/explicit-module-boundary-types": "error",
    "typescript/prefer-readonly": "error",
    "typescript/prefer-readonly-parameter-types": ["error", {
      allow: [
        // ponytail: connection owners deliberately mutate their SDK handles/queues; replace this exception if ownership moves to methods.
        { from: "file", path: "src/servers.ts", name: "ManagedServer" },
        // Native handles retain declaration contracts; readonly borrowing cannot freeze their internal state.
        { from: "package", package: "node", name: ["AbortSignal", "Request", "RequestInit", "URL", "IncomingMessage", "ServerResponse", "TestContext"] },
        { from: "lib", name: "Promise" },
        { from: "package", package: "@earendil-works/pi-coding-agent", name: "AgentSession" },
      ],
    }],
    "no-param-reassign": ["error", { props: true }],
    "no-await-in-loop": "error",
    "no-underscore-dangle": "off",
    // ponytail: Oxlint 1.87 expect-expect ignores node:test/t.test; no-conditional-expect recognizes Vitest expect, not Node assert.*. Requalify when native support lands.
    "vitest/expect-expect": ["error", {
      assertFunctionNames: ["assert", "assert.*", "equal", "deepEqual", "verifySearch", "verifyPrivateOutput", "verifyVisionConfiguration", "verifyReload"],
      additionalTestBlockFunctions: ["t.test"],
    }],
    "vitest/no-conditional-expect": "error",
    "typescript/no-empty-object-type": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/no-invalid-void-type": "error",
    "typescript/no-unnecessary-type-parameters": "error",
    "typescript/unbound-method": "error",
    "typescript/no-misused-spread": "error",
    "typescript/no-for-in-array": "error",
    "typescript/require-array-sort-compare": "error",
    "typescript/method-signature-style": ["error", "property"],
    "typescript/consistent-type-exports": "error",
    "typescript/no-import-type-side-effects": "error",
    "no-implicit-coercion": "error",
    "no-return-assign": "error",
    "no-sequences": "error",
    "no-multi-assign": "error",
    "no-else-return": "error",
    eqeqeq: ["error", "always"], curly: ["error", "all"],
    "no-var": "error", "prefer-const": "error",
    "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error", "no-with": "error",
    "no-debugger": "error", "no-empty": ["error", { allowEmptyCatch: false }],
    "no-empty-function": "error", "no-useless-catch": "error", "no-nested-ternary": "error",
    complexity: ["error", { max: 10, variant: "modified" }],
    "max-depth": ["error", { max: 3 }], "max-params": ["error", { max: 4 }],
    "max-statements": ["error", { max: 40 }],
    "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true }],
    "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
    "import/no-cycle": ["error", { ignoreTypes: false, ignoreExternal: false, allowUnsafeDynamicCyclicDependency: false }],
    "import/no-self-import": "error",
    "import/no-mutable-exports": "error",
    "import/no-duplicates": ["error", { preferInline: true }],
    "typescript/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: true }],
    "unicorn/consistent-function-scoping": "off", "unicorn/no-useless-undefined": "error",
  },
  overrides: [
    {
      files: ["src/auth.ts"],
      rules: {
        // ponytail: native provider resolution can execute commands/refresh; stop at the first key instead of resolving concurrently.
        "no-await-in-loop": "off",
      },
    },
    {
      files: ["test/native-runtime.test.mjs", "scripts/smoke.mjs", "test/fixtures/vision-offline.mjs"],
      rules: {
        // Fixture owners combine setup, execution and teardown; bound them without production's smaller orchestration ceilings.
        complexity: ["error", { max: 15, variant: "modified" }],
        "max-depth": ["error", { max: 4 }],
        "max-statements": ["error", { max: 70 }],
        "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }],
        "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      files: ["src/index.ts"],
      rules: {
        // ponytail: only the explicit ManagedServer owner parameter advances lifecycle state; remove if transitions become owner methods.
        "no-param-reassign": ["error", { props: true, ignorePropertyModificationsFor: ["owner"] }],
      },
    },
    {
      files: ["scripts/smoke.mjs"],
      rules: {
        // ponytail: native stdout/stderr capture replaces stream.write and restores it; use a native output hook if Pi adds one.
        "no-param-reassign": ["error", { props: true, ignorePropertyModificationsFor: ["stream"] }],
        "typescript/prefer-readonly-parameter-types": ["error", {
          allow: [
            // ponytail: stdout/stderr capture temporarily owns write; use a native Pi output hook if one becomes available.
            { from: "package", package: "node", name: "WriteStream" },
          ],
        }],
      },
    },
    {
      files: ["test/native-runtime.test.mjs"],
      rules: {
        // ponytail: cases share process.env and session reload/child disposal; parallel calls would test the wrong configuration.
        "no-await-in-loop": "off",
      },
    },
    {
      files: ["src/register-tool.ts"],
      rules: {
        // ponytail: Pi execute requires five SDK-owned parameters; remove this exception if the SDK adopts an options object.
        "max-params": ["error", { max: 5 }],
      },
    },
  ],
});
