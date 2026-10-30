import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "test-results/**",
    ],
  },
  ...tseslint.configs.recommended,
  { rules: { "no-empty": ["error", { allowEmptyCatch: true }] } },
);
