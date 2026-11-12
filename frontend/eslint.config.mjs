import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      ".next*/**",
      "node_modules/**",
      "next-env.d.ts",
      "test-results/**",
      "work/**",
      "public/mission-archive/vendor/**",
      "public/lunar-education/lunar-education.js",
      "public/lunar-journey/lunar-journey.js",
    ],
  },
  ...tseslint.configs.recommended,
  { rules: { "no-empty": ["error", { allowEmptyCatch: true }] } },
);
