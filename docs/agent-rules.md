# Rules for every Horizon helper agent

Read this before you start. The area helpers (`looks-themes`, `items-board`, `sync-household`, `scrolling-dialogs`) and the `reviewer` all follow it. `docs/handbook.md` has the full background; read the sections your agent file points to.

## The app in one paragraph
Horizon is a shared to-do list for upcoming expenses (not a money tracker; see handbook section 0). Plain HTML/CSS/JS, no build step. `js/*.js` are classic scripts sharing ONE global scope, loaded in the order listed in handbook section 2. A file may only use earlier files at top-level run time.

## Never touch (the lead does these after merging)
- `js/changelog.js`, `APP_VERSION` in `js/config.js`, `sw.js`, the `<script>` / CSS `?v=` tags in `index.html`.
- Firebase settings in `js/config.js`.
- `CLAUDE.md`, `docs/`, `.claude/` (unless the task is about them).
- Never push. Never merge into `main`. Never commit `tests/package-lock.json`.

## Hard rules
1. **No new top-level synced field** on the Firestore household document (`items`, `people`, `activity`, `categories`, `subcategories`, `householdName`, `clientId`, `updatedAt` only). New data goes inside an item or person object, or in per-device localStorage.
2. **Nothing may scroll sideways on a phone** (320px and up). Form fields stay 16px on touch screens.
3. No reCAPTCHA / App Check.
4. Do not add features that ask people to keep numbers up to date (savings progress, budget vs actual, spending charts).
5. Stay inside your area's files. If the task truly needs a change elsewhere, keep it minimal and say so in your report.
6. New CSS goes inside your area's `/* ==== SECTION: ... ==== */` block in `styles.css`, so parallel helpers do not collide.
7. Match the surrounding code: same naming, comment density and style. Small, focused changes.

## How to work
- You run in your own git worktree on your own branch. Commit there with a clear message.
- Scratch scripts and screenshots go in a temp folder outside the repo, never in the repo.
- Tests in a worktree: `NODE_PATH=<main repo folder>/tests/node_modules node tests/run-all.js` (or `npm install` in `tests/` if there is no main install).
- Add or extend a jsdom test for what you changed (`tests/<topic>-test.js`; the runner picks it up). Tests read `APP_VERSION`; never hard-code a version.
- Definition of done: all jsdom suites pass, your area's extra checks pass (listed in your agent file), work committed.

## Report back (short)
1. What changed, in one or two plain sentences (what a family member would see).
2. Files touched, and anything outside your area and why.
3. Tests run and results; anything you could not test (real iPhone, real Firebase, the live site).
4. Branch name and commit.
