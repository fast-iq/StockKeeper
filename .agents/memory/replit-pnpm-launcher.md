---
name: Replit pnpm launcher
description: Why Corepack, rather than pnpm's internal version manager, owns the pinned version in this project.
---

Use Corepack to honor the project's pnpm version pin. Do not remove the pin or change dependency versions to fix development service startup.

**Why:** after importing the GitHub version pin, Replit's system pnpm launcher repeatedly spawned package-manager installation commands until Node could no longer create threads. The same source and lockfile passed all checks when invoked through Corepack.

**How to apply:** preserve the Corepack-based service commands and the distinction between Corepack version selection and pnpm's internal version management. Check current configuration and service logs before changing toolchain settings; CI and the collaborators' Windows wrapper also honor the project pin.