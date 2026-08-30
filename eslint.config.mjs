import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Arch-review Sprint A (N1): workspace is the sole composition root.
 * Other feature folders may use @/lib and @/components, not each other.
 */
const FEATURE_BOUNDARY_MESSAGE =
  "Feature modules may not import other features. Import from @/lib or @/components, or compose in @/features/workspace.";

const NON_WORKSPACE_FEATURES = [
  "simulation",
  "artifacts",
  "landing",
];

function otherFeatureImportPatterns(featureName) {
  const others = [
    ...NON_WORKSPACE_FEATURES.filter((name) => name !== featureName),
    "workspace",
  ];

  return others.map((name) => ({
    group: [`@/features/${name}`, `@/features/${name}/*`, `@/features/${name}/**`],
    message: FEATURE_BOUNDARY_MESSAGE,
  }));
}

function featureBoundaryOverride(featureName) {
  return {
    files: [`src/features/${featureName}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: otherFeatureImportPatterns(featureName),
        },
      ],
    },
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...NON_WORKSPACE_FEATURES.map(featureBoundaryOverride),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
