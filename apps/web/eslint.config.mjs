import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "react-hooks/set-state-in-effect": "off" } },
  // Preserve upstream Draw/Snap plugin interop while the GIS engine is regression-tested.
  { files: ["components/gis/**/*.ts", "components/gis/**/*.tsx", "lib/turf-tools.ts"], rules: {"@typescript-eslint/no-explicit-any":"off", "@typescript-eslint/ban-ts-comment":"off"} },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "public/vendor/**",
  ]),
]);
