---
name: Google OAuth preview origin
description: The automated app preview uses a localhost origin that Google OAuth may reject even when Replit dev and production origins are configured.
---

The automated app preview is served from a local proxy origin, so Google OAuth origin errors seen there do not prove that the configured Replit dev or production origins are invalid.

**Why:** Google Identity Services validates the browser origin exactly, while the preview harness uses a different local origin than the user-facing Replit URL.

**How to apply:** Validate Google sign-in from the actual `*.replit.dev` or published `*.replit.app` URL. Keep the local screenshot useful for layout checks, but treat its Google OAuth origin error as non-authoritative.