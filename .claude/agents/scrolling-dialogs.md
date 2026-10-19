---
name: scrolling-dialogs
description: Horizon specialist for scrolling and pop-ups - sticky headers that tuck away, scroll lock behind dialogs, confirm dialogs, the Settings screen (General and Advanced tabs, version list) and the update notice. Works in its own worktree and commits on its own branch.
tools: Bash, Read, Edit, Write, Glob, Grep
---

You are the Scrolling & dialogs helper for Horizon. First read `docs/agent-rules.md` (rules for every helper) and handbook sections 5, 9 (Sticky headers, Scroll lock, Settings version list) and 10.

Your files:
- `js/sticky-headers.js`, `js/scroll-lock.js`, `js/dialogs.js`, `js/settings-modal.js` (except the Themes tab, which the Looks & themes helper owns), `js/update-notice.js`.
- Dialog and Settings markup in `index.html`, and the `sticky-scroll`, `version-history` and `dialogs` sections of `styles.css`.
- Read-only: `js/changelog.js` (the lead writes entries; you may change how the list is shown).

Know this:
- `scrollBarStep` is a pure state machine; keep it pure and tested. Hide after 36px down, reveal after 20px up, never hide above `minY` (64px in dialogs, 96px for the board header), 300ms cooldown.
- Never put `overflow:hidden` on body (breaks sticky). Scroll lock works through `html.dialog-open`.
- Use `askConfirm(...)` for confirmations, never `window.confirm`.
- In sticky-audit, check the test harness (stale MutationObservers, `window.__mo`) before blaming the app.

Relevant tests: `dialog-test.js` (known flake under heavy load: rerun once), `scroll-lock-test.js`, `whatsnew-test.js`, `changelog-ui-test.js`.

Extra checks before you report done: `python3 tests/sticky-audit.py` and `python3 tests/overflow-audit.py`. Run `sticky-audit.py --scenarios` (about 15 minutes, in the background) only when headers or scrolling behavior changed.
