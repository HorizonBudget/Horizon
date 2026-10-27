# Horizon handbook

Last updated at version **3.7.0**, 2026-10-27. Moved from the claude.ai Project into the repo so Claude Code on David's computer can use it. Keep this file current: update it when you learn something a future session would need.

## 0. The owner's vision (read first)
Horizon is a **shared to-do list for upcoming expenses**, not a money tracker. EveryDollar already tracks what the family actually spends and saves. Do NOT propose features that ask the user to keep numbers up to date (savings progress, set-aside amounts, budget-vs-actual reports, spending charts). Good ideas make the list easier to keep, share, see and tick off.

## 1. What it is
A shared "future expenses" planner for a household. Add the big things coming up, see totals by month, tick them off. Everyone in the household sees the same board on their own phone or computer. No accounts: a **household code** is the key. It complements EveryDollar rather than replacing it.

- Live: https://horizonbudget.github.io/Horizon/ (GitHub Pages serves the repo as-is, no build step; publishes about a minute after a push to `main`).
- Repo: https://github.com/horizonbudget/horizon (GitHub reports the canonical name as `HorizonBudget/Horizon`; the lowercase URL still works for clone and push).
- Data lives in Firebase Firestore (project id `spending-forecast-939d9`), so redeploying never touches anyone's data.
- Version history doc (Claude Docs): https://claude.ai/code/artifact/ceb74dba-f139-4912-83e1-693f70cc4673 ("Household Forecast: Version History"). Newest release at the top; the newest heading is marked "(current)".

## 2. Layout of the repo
| Path | What it holds |
| --- | --- |
| `CLAUDE.md` | David's working rules for Claude Code; imports this handbook. |
| `docs/handbook.md` | This file. `docs/SETUP-CLAUDE-CODE.md` is David's one-time setup guide. |
| `.claude/skills/` | `/start`, `/preview`, `/release` shortcuts. `.claude/agents/` holds the test agent, four area helpers and a reviewer (section 8). `.claude/settings.json` pre-approves safe commands. |
| `docs/agent-rules.md` | Rules every helper agent reads first (never-touch files, hard rules, how to report). |
| `index.html` | Markup only: sign-in screen, board, every dialog, and the `<script>` list. |
| `styles.css` | All CSS. Has section markers like `/* ==== SECTION: seasonal-patterns ==== */`, `sticky-scroll`, `version-history`, `items-board`, `household-sync`, `dialogs`, `END OF FILE`. Add new CSS inside the right section so parallel agents do not collide. |
| `js/*.js` | Classic (non-module) scripts sharing ONE global scope. Handlers like `onclick="..."` in `index.html` call global functions by name. |
| `sw.js` | Service worker. Since 3.5.0 the page is stale-while-revalidate (saved page opens at once; the new page is saved only once all its `?v=` files are, and only pages that name `?v=` files count; so a release shows on the second open), cache-first for versioned app files across the current and previous version's caches. Precaches `APP_FILES` and the self-hosted fonts in `fonts/` (OFL). Scripts are `defer`. Never touches Firestore traffic. |
| `manifest.webmanifest`, `*.png` | Install settings and icons. |
| `tools/release.py` | Version stamper (see Releasing). |
| `tools/make-preview.js` | Builds the safe preview (see Previewing). |
| `tests/` | jsdom suites plus real-Chromium scripts. |
| `preview/` | Git-ignored output of `make-preview.js`. |
| `README.md` | Shorter version of this handbook, shown on the GitHub repo page. |

### Script load order (a file may only use earlier files at top-level run time; functions called later from clicks/timers can live anywhere)
config, util, state, suggest, themes, profiles, crop, items, dialogs, trash, item-helpers, toast, search, month-groups, backup-reminder, cards, settings, update-notice, changelog, settings-modal, sticky-headers, render, style-guide, cloud, household, pwa, scroll-lock, main (runs last).
`tests/layout-test.js` boots the whole app and fails loudly if the order breaks. After adding or removing a script file, run `python3 tools/release.py` with no argument to refresh the lists.

## 3. Data rules (the ones that matter)
- One Firestore doc per household: `households/{CODE}` with fields `items`, `people`, `activity`, `categories`, `subcategories`, `householdName`, `clientId`, `updatedAt`.
- The Firestore security rules use `hasOnly`. **NEVER add a new top-level synced field.** New data goes inside an item or person object, or into per-device localStorage.
- Per-device localStorage keys include `horizonBoardCache` (3.5.0 quick-open copy), `ledgerSettings` (theme, pattern, view settings), `horizonSeenVersion` (update notice), `lastBackupAt`.
- Removed items stay in `items` with a `deletedAt` for 30 days (trash).
- To-dos (3.3.0) also live in `items`, marked `kind:'todo'` (fields: name, completed, completedAt, due 'YYYY-MM-DD', owner, notes, url, linkId, category (3.7.0, shared `categories` list), createdAt). `liveItems()`/`findLiveItem()` are budget items only; use `liveTodos()`/`findLiveTodo()` for to-dos. Per-device: `ledgerSettings.side`, `ledgerSettings.todoFilter` (3.7.0 chip: all / mine / a category), `horizonCollapsedTodoGroups`.
- Item owners are stored by name; people have stable ids. Renaming a person rewrites item owners.
- Firebase web keys in `js/config.js` are public by design. Protection is the Firestore rules. (Sanity check: `spending-forecast-939d9` appears 3 times in `js/config.js`.) The owner does not want reCAPTCHA / App Check for now.

## 4. Releasing (every time; `/release` walks through this)
1. Make the change on a branch (agents work in isolated worktrees; you review and merge into `release/X.Y.Z`).
2. Add a new entry at the **top** of `CHANGELOG` in `js/changelog.js`:
   - `v`, `date`, `items: [...]` (plain-language lines shown in Settings -> Version history).
   - `ui: [...]` ONLY if people will see or do something differently. Those lines appear once, in a dialog, the next time someone opens the app. Leave `ui` out for behind-the-scenes work and people just get a small toast "Horizon just got a little brighter!".
3. `python3 tools/release.py X.Y.Z` stamps `APP_VERSION` (js/config.js), the `?v=` on every script and the CSS link in `index.html`, `SW_VERSION`, and the `APP_FILES` block in `sw.js`. `python3 tools/release.py --check` verifies; no argument re-syncs.
4. Run the tests (section 6).
5. Commit (Claude Code adds its own attribution). `git pull --rebase origin main` first, then **ask David** before `git push origin main`.
6. Update the Version History doc. If Claude Docs tools are available in this session (they come from David's claude.ai connectors), use `update` on that doc (body node `8f3a22f8-3ff3`): delete the text " (current)" with a find target, then insert a new `## X.Y.Z · date (current)` section with bullet lines before the previous newest heading (a `search` read for "(current)" gives that heading's id; at 3.2.0 it was `mfz77zvpp19.10802`, re-read each time). If the tools are NOT available, give David the finished section as one block to paste at the top of the doc, and say so plainly.
7. Tell David what changed in plain language and what you could not verify. Ask him to open the live site to confirm.
8. Clean up: remove agent worktrees and branches; never commit `tests/package-lock.json` (it is git-ignored).

**Version numbers:** middle number (3.1.0 -> 3.2.0) for feature releases, third number (3.2.0 -> 3.2.1) for fix-only releases, first number for big structural changes (3.0.0 was the file split).

## 5. How the update notice works
`checkWhatsNew(resumed)` runs at the end of `enterApp` (js/update-notice.js). It compares `horizonSeenVersion` with `APP_VERSION` using `versionCmp` (numeric). First-time device: silent. Resumed device with nothing stored: treated as coming from 2.11.0. Since 3.3.2 (David's call) only a big update is announced: if the first number did not go up (3.3.1 -> 3.4.0), it just remembers the new version silently. For a big update it collects `ui` lines from CHANGELOG entries newer than the last seen version; no lines gives the toast, otherwise `askConfirm({title:'Horizon just got a little brighter!', message: bullets, confirmLabel:'Got it', info:true})`. `#confirmMsg` uses `white-space:pre-line`.

## 6. Testing
One-time setup on this computer (`/start` checks and offers to do it): Node.js, Python 3, git; then
```
cd tests && npm install                              # jsdom for the fast suites
python3 -m pip install --user playwright             # real-browser scripts
python3 -m playwright install chromium               # downloads a test copy of Chromium (local computer only)
```
On Windows use `python` or `py` where these notes say `python3`.

Run:
```
node tests/run-all.js            # all 34 jsdom suites; exit 1 on any failure (run from the repo folder or tests/)
node tests/run-all.js undo       # only suites whose name contains "undo"
python3 tests/browser-smoke.py   # files load, offline reload works
python3 tests/overflow-audit.py  # sideways scroll at 7 phone/desktop sizes, incl. seasonal themes + patterns
python3 tests/sticky-audit.py    # sticky headers; --scenarios takes ~15 min (run it in the background); --dialog=<name>
```
The browser scripts serve the repo locally and blank the Firebase key through a route on `/js/config.js`, so they never touch real data. They use `/opt/pw-browsers/chromium` if it exists (the old cloud sandbox), otherwise Playwright's own Chromium.
Agents in worktrees can reuse the main folder's install: `NODE_PATH=<main repo folder>/tests/node_modules node tests/run-all.js`.
Expected state at 3.2.0: 21/21 suites pass, overflow-audit 0 bad, browser-smoke ALL OK, sticky-audit --scenarios ALL OK.
Known flake: `dialog-test.js` ("unreadable image", "clipboard failure") failed once while heavy browser tests ran at the same time; it passed on rerun. Rerun before suspecting the code.
`tests/lib/build-app.js` stitches index.html + styles.css + js/*.js into one page. Tests are version-agnostic (they read `APP_VERSION`). Add tests as `tests/<topic>-test.js`; the runner picks them up. Each suite prints PASS/FAIL lines and ends with "N passed, M failed".

## 7. Previewing before you push
`node tools/make-preview.js` writes `preview/horizon-preview.html`: the combined app with the Firebase `apiKey` blanked (it refuses to build otherwise), signed in as "Preview" with demo items, plus a bar at the bottom with Sage / Dots / Christmas / Halloween / Hide buttons. Open it for David (`open preview/horizon-preview.html` on a Mac, `start preview\horizon-preview.html` on Windows). For a phone-sized look, he can use the browser's device toolbar, or you can screenshot it at 390px with Playwright.
If David wants a link he can open on his phone, and an Artifact tool is available, build `node tools/make-preview.js --fragment preview/fragment.html` and publish that as a private Artifact.
Not working in a preview: install, offline, real sync. Push to `main` only after David approves.
Tips: if you edit `make-preview.js`, use the LAST `<body>` (comments can contain the text `<body>`) and use a function replacer with `String.replace`, since `$$` and `$'` in a replacement string get mangled.

## 8. Working with agents (David's standing instruction)
Give implementation tasks to subagents with worktree isolation, each on its own branch, with a short scope and a clear definition of done (tests that must pass, files they may touch, files they must NOT touch: changelog, versions, sw.js, script tags). You write the changelog and stamp the version yourself after merging, so agents never conflict there. Parallelize independent pieces. Agents commit; you review diffs, merge into a `release/X.Y.Z` branch, resolve conflicts (two agents editing neighboring lines in js/themes.js or a shared test is common), run the full tests, then clean up branches and worktrees. Tell each agent to put scratch scripts and screenshots in its own temp folder, never in the repo.

**Specialist helpers (added after 3.2.0).** Pick the one whose area fits the task; each reads `docs/agent-rules.md` first and knows its files and tests. Launch them with worktree isolation.
| Agent | Area |
| --- | --- |
| `looks-themes` | themes, seasonal styles, patterns, colors/contrast, general CSS, phone layout |
| `items-board` | adding/editing items, suggestions, cards, months, search, filters, repeats, trash, undo |
| `sync-household` | household code, Firebase sync, people/profiles, photos, backups, install; guards the no-new-top-level-field rule |
| `scrolling-dialogs` | sticky headers, scroll lock, confirm dialogs, Settings (except Themes tab), version list, update notice |
| `reviewer` | read-only check of a helper's branch (house rules, bugs, tests) before merging or previewing |
| `test-runner` | runs all tests and reports |
Flow: area helper(s) in parallel -> `reviewer` on each branch -> fix rounds -> merge into `release/X.Y.Z` -> `test-runner` -> `/preview` for David -> `/release`. A task spanning two areas: split it, or give it to the main area's helper and say which other files it may touch.

## 9. Feature notes worth knowing
**Themes (js/themes.js, js/settings.js, js/settings-modal.js):** Settings -> Themes. Besides the base themes there are 8 seasonal ones: Halloween (dark), Autumn, Christmas, Winter, Valentine's, Spring, Summer, Fourth of July. Three derived color values in `customVars` were tuned for WCAG AA (soft text, danger red, text on accent buttons).
**Christmas (3.2.0):** light, red and white: paper `#FBF7F4`, accent `#A50F2A`, 🎅 pattern. A theme may set an optional `danger` color (only Christmas does: `#A33A00`), because the standard danger red was identical to its red accent. Saved themes keep `danger`; editing colors by hand in Custom drops it. The two reds differ mainly in hue (contrast 1.17), so a red/orange color-blind person may not tell them apart.
**Background patterns (3.1.0, stronger in 3.2.0):** None, Stripes, Diagonal stripes, Dots, Grid, Emoji, with size and strength controls, 13 preset emoji, and a sanitized custom emoji field (1 to 3 emoji). Opacity: geo 0.08 / 0.13 / 0.18, emoji 0.14 / 0.22 / 0.30; `PATTERN_MAX_OPACITY` 0.30. Soft text keeps its AA margin against a 16% ink tint (`PATTERN_SOFT_TEXT_TINT`); soft/accent text straight on the page (`.empty` message, "Collapse all") gets a paper backing whenever a pattern is on, and a test checks that CSS stays. Drawn on a fixed `pointer-events:none`, `z-index:-1` layer, never with `background-attachment:fixed` (breaks on iOS). Stored per device in `ledgerSettings`; saved themes remember the pattern; "Reset to Sage" clears it.
**Frosted Active/Completed bar (3.2.0):** with a pattern on, `.board-sticky` uses 70% paper + `backdrop-filter: blur(4px)`, behind an `@supports` guard.
**Sticky headers (js/sticky-headers.js):** `scrollBarStep` is a pure state machine; `bindScrollBar` adds a 300ms cooldown with a trailing re-check. Hide after scrolling down 36px, reveal after up 20px, never hide above `minY` (64px in dialogs, 96px for the board header). Re-baselines on layout changes; a barely scrollable page always shows the full header. Do not use `overflow:hidden` on body (breaks sticky).
**Scroll lock (js/scroll-lock.js):** a MutationObserver on `.overlay` elements toggles `html.dialog-open` so the board cannot scroll behind Settings or any dialog.
**Settings version list:** `renderChangelog()` shows the current version plus "Show all versions" / "Hide older versions"; resets each time Settings opens.
**Board header:** "Collapse all / Expand all" sits in the "Coming up" row left of Filters (36px tap height).
**Mobile rules:** fields are 16px under `@media (pointer:coarse)` plus the <=640px rule; `html{touch-action:manipulation}`; `@supports (overflow:clip){html,body{overflow-x:clip}}`; the `@media (max-width:360px)` block hides `.add-long` and `.act-recent` labels and allows wrapping.

## 10. Rules that have bitten before
- Sideways scroll on iPhone: landscape fields at 15px made iOS zoom and pan. Keep 16px, `touch-action:manipulation`, `overflow-x:clip`.
- 320px overflow came from the Add button, the Recent activity pill and the Settings "Leave" button; the <=360px block and `.guide-actions .btn{max-width:100%}` fix it. Re-run `overflow-audit.py` after any layout change.
- Version literals in tests broke on every bump, so tests read `APP_VERSION`.
- In sticky-audit, "flapping" was once a test-harness bug (stale MutationObservers). Check `window.__mo` is disconnected before re-watching before blaming the app.
- From the old cloud sandbox the live site could not be reached. On David's computer you may be able to fetch it; otherwise ask him to open the live URL to confirm a deploy.

## 11. Release history (recent)
- **2.12.0**: update notice, plus iPhone sideways-scroll fixes.
- **3.0.0**: behavior-neutral split of the single big file into `index.html` + `styles.css` + `js/*.js`; `tools/release.py`; offline file list in `sw.js`.
- **3.1.0** (commit 1124993): seasonal themes, background patterns, calmer sticky headers, scroll lock behind dialogs, "Show all versions", Collapse all next to Filters.
- **3.2.0** (commit a913a15): red and white Christmas with 🎅, stronger patterns, frosted Active/Completed bar, README refresh.
- After 3.2.0 (no version bump, tooling only): moved to Claude Code: `CLAUDE.md`, this handbook, `.claude/` shortcuts and agent, `tools/make-preview.js`, setup guide. Then (2026-10-17): four area helper agents plus a reviewer, `docs/agent-rules.md`, the `/preview` skill file (it was missing from the repo), and empty CSS section markers.
- **3.3.0** (commit c8d6044): shared To-do side (js/todo.js), search in the top bar covering budget and to-dos (closes on tap-off), ⋯ on budget cards, "+ Budget item" / "+ To-do item". 22 jsdom suites now.
- **3.7.0**: to-do categories: chip row (All · Mine · categories · No category, counts) replaces Everyone/Mine and scrolls away with the list; pinned bar shows a small "<category> ✕"; Category picker in the to-do dialog shares the budget `categories` list; pairing fills an empty/auto category only; category names reused case-insensitively on both sides. No category rename/delete exists in the app yet.
- **3.6.0**: edge-case sweep (new tests/edge-*-test.js) and safer sync: every save is a `runTransaction` that re-reads the server doc and merges only this device's changes (field by field, by item/person id; renames carried into owners); offline/unsent edits live in `horizonBoardCache` (not Firestore's write queue); listener copies are never skipped and no client clocks order anything; restore still replaces the whole board (David's call) and warns for another household's backup; 800 KB warning, ~1 MB stop; damaged docs repaired. Emulator scripts used in review: tests not in repo (scratch). Short money display from $10k (`fmtMoneyShort`), `$`/commas in costs, accent swatches re-shaded per mode (old hexes alias to swatches), Undo toasts above dialogs (z 85, confirm z 90). Known: a 3.5.x queued `setDoc` can still replay once after upgrading; same-field edits within ~3 s of a slow save can resolve last-writer-wins.
- **3.5.1**: hotfix: `onSnapshot` now uses `includeMetadataChanges:true` (without it, a server copy equal to the cache never fired, so 3.5.0 sat on "Updating…" holding writes); `getDocFromServer` fallback after 6s online and on online/wake; tests/held-sync-test.js models the SDK rule.
- **3.5.0**: faster start-up: self-hosted fonts, saved page opens at once, deferred scripts; board draws only the first 40 cards then batches, hidden side not built, photos as shared blob: URLs; signed-in devices open from a per-device copy (`horizonBoardCache` in localStorage) showing "Updating…", merge only on the first server snapshot (cached snapshots ignored while held), "Not synced — changes kept here" on refusal. Known gap: a whole-doc `setDoc` left in Firestore's write queue by a killed session can still overwrite newer changes (true before too; fix would be per-field `updateDoc`).
- **3.4.0**: to-do website link (`url` field on the to-do, `todoUrl()`), "Budget item pair" label, tap anywhere on a budget card to open it (`.card-tap`).
- **3.3.2**: iPhone keyboard fit for dialogs (js/scroll-lock.js `initKeyboardFit`, `html.dialog-open.kb-open`), outlined icons on to-do rows, update notice only for major bumps.
- **3.3.1**: the 💵 chip on a to-do jumps to the linked budget item (Budget side, month opened, card flashed). CLAUDE.md rule 10: a yes to a push covers what David adds in that round.
Older history lives in the Version History doc and `js/changelog.js`. The dates for 1.0.0 to 1.1.0 in the doc are guesses (a doc comment asks the owner to confirm).

## 12. Open items and known gaps
1. **iPhone check for 3.2.0: done.** David tried the 4-point checklist (sideways scroll, sticky headers, emoji patterns, frosted bar) on the live site in Safari on 2026-10-17; all looked fine. New visual work still needs its own iPhone check.
2. **David's original "sticky header not working" instance was never reproduced.** Three plausible causes were fixed in Chromium. If it happens again, ask what screen, what device and what he was doing, and get a screenshot.
3. Stale preview Artifacts on claude.ai: 3.1.0 (https://claude.ai/artifact/4ucpbLVWA2FBK7UvaKzqiq) and 3.2.0 (https://claude.ai/artifact/Vb2m99WLmjsAkzxwAGhD7X). Delete only if David asks.
4. Never verified: the live deployment after each push, real phone install and offline use, real Firebase behavior for new features.
5. Claude Docs tools were available in a claude.ai cloud session on 2026-10-17. Still unknown for Claude Code on David's own computer (affects release step 6).
