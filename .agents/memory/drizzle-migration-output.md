---
name: Drizzle migration output path
description: Drizzle Kit can misresolve generated snapshots when the output directory is absolute.
---

Configure Drizzle Kit's migration `out` as a path relative to the package working directory, such as `./migrations`. An absolute output path may work for the first generation but be prefixed incorrectly when the next run loads existing snapshots, causing `ENOENT`.

**Why:** repeated schema generation must be able to read the same snapshot it created.

**How to apply:** keep `out` relative to the package; after creating the initial snapshot, run generation again to confirm it loads without producing a false schema diff.