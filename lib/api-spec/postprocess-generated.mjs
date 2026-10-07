import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function workspaceFile(relativePath) {
  return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

function writeNormalized(filePath, transform = (content) => content) {
  const current = readFileSync(filePath, "utf8");
  const next = transform(current).replace(/\n+$/u, "\n");

  if (next !== current) {
    writeFileSync(filePath, next);
  }
}

// The project uses Zod 3, while current Orval emits Zod 4 top-level helpers
// for OpenAPI formats (email, uri). Rewrites them to the Zod 3 string
// variants used everywhere else in the generated file.
writeNormalized(workspaceFile("api-zod/src/generated/api.ts"), (content) =>
  content
    .replaceAll("zod.email()", "zod.string().email()")
    .replaceAll("zod.url()", "zod.string().url()"),
);

writeNormalized(workspaceFile("api-client-react/src/generated/api.ts"));
writeNormalized(workspaceFile("api-client-react/src/generated/api.schemas.ts"));

// These package indexes are maintained by the workspace and must not be
// expanded by Orval's generated barrel exports.
writeFileSync(
  workspaceFile("api-client-react/src/index.ts"),
  [
    'export * from "./generated/api";',
    'export * from "./generated/api.schemas";',
    'export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";',
    'export type { AuthTokenGetter } from "./custom-fetch";',
    "",
  ].join("\n"),
);
writeFileSync(
  workspaceFile("api-zod/src/index.ts"),
  'export * from "./generated/api";\n',
);
