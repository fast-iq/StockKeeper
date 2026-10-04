---
name: Browser network lifecycle
description: Lifetime of held browser routes and response handles across document navigation in isolated tests.
---

Held browser routes must finish before a test changes the document or closes its context; preserve the context-level loopback guard when removing page-level test routes.

**Why:** unfinished route callbacks can outlive the test and raise asynchronous errors after apparently successful assertions.

**How to apply:** release every gate in `finally` and wait for page route handlers to settle before logout/navigation/cleanup.

Do not depend on retrieving an old browser response body after an action intentionally navigates away from its document.

**Why:** Chromium can discard the response resource during navigation even though the server operation succeeded.

**How to apply:** for navigation-producing logout, assert the response status, destination URL and anonymous API state instead. Password API login still requires draining its response before using the session.