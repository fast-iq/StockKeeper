---
name: Codegen overwrites api-zod index.ts
description: After running codegen, lib/api-zod/src/index.ts gets reset to export both ./generated/api and ./generated/types, causing duplicate export TS errors unless postprocess runs.
---

## Rule
`pnpm --filter @workspace/api-spec run codegen` must run the full script (`orval` **and** `node ./postprocess-generated.mjs`). The postprocess step rewrites `lib/api-zod/src/index.ts` back to the single line:
```ts
export * from "./generated/api";
```
If someone runs bare `orval` without postprocess, restore that file manually (remove `export * from "./generated/types";`).

**Why:** `./generated/types/` contains per-schema TypeScript type files that re-export the same names as `./generated/api`, causing TS2308 "already exported a member named X" errors in all consumers. The frontend uses deep imports (`@workspace/api-zod/src/generated/types`) directly for TypeScript types like `CategoryNode`, so the barrel export is not needed.

**How to apply:** After any codegen run, verify `lib/api-zod/src/index.ts` contains only the `./generated/api` export and run `pnpm run typecheck:libs` to catch duplicate-export errors. Also note: codegen output in `lib/**/generated/**` is `.prettierignore`d (orval style, e.g. single quotes, is acceptable there); `lib/api-spec/openapi.yaml` itself is NOT ignored - run prettier on it after editing.
