import tsParser from "@typescript-eslint/parser";
import boundaries from "eslint-plugin-boundaries";
import importPlugin from "eslint-plugin-import";

/**
 * Clean-Architecture dependency rule, enforced via eslint-plugin-boundaries.
 *
 * Allowed edges (inward-only):
 *   entities    <-  (nothing — pure TS, no deps on other layers)
 *   usecases    <-  entities, adapters
 *   adapters    <-  entities
 *   infra       <-  entities, adapters
 *   composition <-  everything (the only DI bridge)
 *   app         <-  composition
 *
 * Plus `import/no-cycle` — no module may sit in an import cycle.
 *
 * Biome handles formatting + quick lint; ESLint is used SOLELY for this rule.
 */
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "migrations/**",
      "scripts/**",
      "tests/**",
      "drizzle.config.ts",
      "eslint.config.js",
    ],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      boundaries,
      import: importPlugin,
    },
    settings: {
      "boundaries/elements": [
        { type: "entities", pattern: "src/entities/**" },
        { type: "usecases", pattern: "src/usecases/**" },
        { type: "adapters", pattern: "src/adapters/**" },
        { type: "infra", pattern: "src/infra/**" },
        { type: "composition", pattern: "src/composition/**" },
        { type: "app", pattern: "src/app/**" },
      ],
      "boundaries/include": ["src/**/*.ts"],
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "entities", allow: ["entities"] },
            { from: "usecases", allow: ["entities", "adapters", "usecases"] },
            { from: "adapters", allow: ["entities", "adapters"] },
            { from: "infra", allow: ["entities", "adapters", "infra"] },
            {
              from: "composition",
              allow: ["entities", "usecases", "adapters", "infra", "composition"],
            },
            { from: "app", allow: ["composition", "app"] },
          ],
        },
      ],
      "boundaries/no-unknown": "error",
      "boundaries/no-unknown-files": "error",
    },
  },
];
