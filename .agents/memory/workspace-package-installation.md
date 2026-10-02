---
name: Workspace package installation
description: How to add runtime dependencies to a specific package in this pnpm workspace
---

Install runtime dependencies against the owning workspace package. Generic package-install helpers target the monorepo root and can fail with pnpm's workspace-root safety check.

**Why:** This workspace keeps dependencies isolated per artifact, and a root install does not make a dependency available to the server that imports it.

**How to apply:** Use the package's workspace filter when adding a dependency, then restart its managed workflow so the runtime picks up the lockfile change.