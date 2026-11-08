import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", ".next-e2e-dev/**", ".next-e2e-newuser/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
];

export default config;
