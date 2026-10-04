---
name: Asset upload filenames
description: Unicode filenames may fail when registering downloadable assets.
---

Use an ASCII basename for downloadable output files; the display title and description can remain Russian.

**Why:** Asset registration rejected a Cyrillic XLSX basename with a ByteString conversion error, while an identical copy with an ASCII basename registered successfully.

**How to apply:** If asset upload fails with this error, create an ASCII-named copy and present that copy. Never rename or overwrite the user's original upload.