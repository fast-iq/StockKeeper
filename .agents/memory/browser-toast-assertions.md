---
name: Browser toast assertions
description: Radix toast announcements and visible notifications need different browser selectors.
---

For visible toast assertions, select the open toast itself rather than the
`status` role. In Radix Toast, that role can refer to a hidden live announcement
whose text is not represented by the same nested title elements.

**Why:** a successful language retry showed the visible notification, but a
`status` locator with a nested title filter could not find it.

**How to apply:** assert the open notification's visible title. When saving
changes the interface language, allow either the submitting render's translation
or the new translation for the success message; verify the resulting interface
language separately.