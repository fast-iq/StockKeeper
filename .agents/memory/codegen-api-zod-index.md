---
name: Codegen overwrites api-zod index.ts
description: After running codegen, lib/api-zod/src/index.ts gets reset to export both ./generated/api and ./generated/types, causing duplicate export TS errors.
---

## Rule
After every run of `pnpm --filter @workspace/api-spec run codegen`, manually restore `lib/api-zod/src/index.ts` to:
```ts
export * from "./generated/api";
```
Remove the `export * from "./generated/types";` line that codegen adds back.

**Why:** `./generated/types/` contains per-schema TypeScript type files that re-export the same names as `./generated/api`, causing TS2308 "already exported a member named X" errors in all consumers. The frontend uses deep imports (`@workspace/api-zod/src/generated/types`) directly for TypeScript types like `CategoryNode`, so the barrel export is not needed.

**How to apply:** Any time you run codegen, immediately follow up with `pnpm run typecheck:libs` to catch the duplicate-export error, then fix `lib/api-zod/src/index.ts`.
