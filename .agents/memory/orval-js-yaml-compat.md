---
name: Orval and js-yaml compatibility
description: Compatibility constraint between the API generator and the workspace js-yaml override.
---

The current Orval release imports `js-yaml` through a default ESM import, while the workspace security override resolves `js-yaml` to a release without that default export. API codegen can therefore fail before reading the OpenAPI document.

**Why:** The workspace security baseline intentionally upgrades transitive packages, but this generator/runtime combination is not compatible with the upgraded module shape.

**How to apply:** Before regenerating API clients, validate Orval against the resolved js-yaml version. Prefer a maintained compatible generator/dependency combination; if generation is blocked, keep the OpenAPI contract authoritative and update generated outputs carefully rather than allowing a failed clean generation to leave them incomplete.