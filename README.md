# Horizon

## What this is

A shared "future expenses" planner for a household. It sits alongside EveryDollar: add the big things you know
are coming, see what they add up to by month, and tick them off as you go. Everyone in the household sees the
same board on their own phone or computer, with no accounts (a household code is the key).

What it does today: items grouped by month with totals, search and filters, repeating items, a "what did you actually
pay" step when you tick something off, Undo, deleted items kept for 30 days, profiles with photos, backup and restore,
install as an app (works offline), and per-device looks: themes (including seasonal ones like Halloween and Christmas),
saved custom themes and background patterns (stripes, dots, grid or emoji).

Live at https://horizonbudget.github.io/Horizon/ (GitHub Pages, serves this repo as it is, no build step).

## How it is put together

Plain HTML, CSS and JavaScript. No framework, no bundler, no install step to run the app.

| File | What it holds |
| --- | --- |
| `index.html` | The page markup only (sign-in screen, board, every dialog) and the list of script files |
| `styles.css` | All the styling, including the themes and the phone layouts |
| `js/*.js` | The code, in the order `index.html` loads them (see below) |
| `sw.js` | Service worker: lets the app install and open offline |
| `manifest.webmanifest`, `*.png` | Install settings and icons |
| `tests/` | Automated checks (see Testing) |
| `tools/release.py` | Keeps the version number in step everywhere (see Releasing) |

The scripts are ordinary (non-module) scripts that share one scope, exactly as the old single file did. That is
deliberate: the `onclick="..."` handlers in `index.html` call functions by name, so every function stays global.
Because of that, **a file can only use things from files listed before it** when it runs top-level code
(functions called later, from clicks or timers, can live anywhere). `tests/layout-test.js` boots the whole app
and will fail loudly if the order breaks.

Load order, and what each file owns:

1. `config.js` app version and Firebase settings. `util.js` tiny helpers used everywhere (`escapeHtml`, `lsGet`).
2. `state.js` the shared data (items, people, categories, months) and the filter and category helpers.
3. `suggest.js` price catalog and the "suggested price" engine.
4. `themes.js` colour system, themes, avatars. `profiles.js` people, rename, own-profile lock, profile pages.
5. `crop.js` photo crop editor. `items.js` sign-in, add/edit/save/remove item. `dialogs.js` the in-app confirm dialog.
6. `trash.js` deleted items. `item-helpers.js` links and notes, month sorting, money, repeat rules.
7. `toast.js`, `search.js`, `month-groups.js`, `backup-reminder.js`, `cards.js` (item cards, completing, restoring).
8. `settings.js`, `update-notice.js`, `changelog.js` (the version history list), `settings-modal.js`,
   `sticky-headers.js` (headers that tuck away as you scroll).
9. `render.js` draws the board. `style-guide.js`. `cloud.js` Firebase sync. `household.js` codes, backup, leaving.
10. `pwa.js` install prompt and service worker registration. `scroll-lock.js` stops the page behind an open dialog
    from scrolling. `main.js` start-up (runs last).

## Things to know before changing data

- Everything synced lives in **one Firestore document per household** (`households/{CODE}`): `items`, `people`,
  `activity`, `categories`, `subcategories`, `householdName`, `clientId`, `updatedAt`. The security rules only allow
  those fields, so **never add a new top-level synced field**. New data goes inside an item or person object, or in
  this device's localStorage.
- Removed items stay in `items` with a `deletedAt` for 30 days.
- Owners on items are stored by name; people have stable ids. Renaming a person rewrites item owners.
- Themes, saved themes, background patterns and most view settings are per device (localStorage).

## Testing

```
cd tests
npm install            # once: installs jsdom
node run-all.js        # all 21 suites, several at once; exit code 1 if any fails
node run-all.js undo   # only suites whose file name contains "undo"
python3 browser-smoke.py     # real Chromium: files load, offline reload works (needs Playwright)
python3 overflow-audit.py    # sideways-scroll audit at phone sizes (needs Playwright)
python3 sticky-audit.py      # real Chromium: scrolling headers and the no-scroll-behind-dialogs lock (slow)
```

`tests/lib/build-app.js` stitches `index.html` + `styles.css` + `js/*.js` into one page for the jsdom suites, so they
run the real files. Add new tests as `tests/<topic>-test.js`; the runner picks them up. Every suite prints `PASS`/`FAIL`
lines and ends with `N passed, M failed`.

## Releasing

1. Make the change. Add a new entry **at the top** of `CHANGELOG` in `js/changelog.js`.
   - `items` are the plain-language lines shown in Settings → Version history.
   - Add `ui: ['...']` only when people will **see or do something differently**. Those lines are shown once, in a
     notice, the next time someone opens the app. Leave `ui` out for behind-the-scenes work: people just get the small
     "Horizon just got a little brighter!" message.
2. Run `python3 tools/release.py X.Y.Z`. It updates `APP_VERSION`, the `?v=` on every file in `index.html`, `SW_VERSION`
   and the offline file list in `sw.js`. (After adding or removing a script file, run `python3 tools/release.py` with no
   version to refresh the lists; `--check` changes nothing and fails if anything is out of step, and
   `tests/layout-test.js` runs it.)
3. Run the tests (and the Playwright scripts if anything visual changed).
4. Commit and push to `main`. GitHub Pages publishes it in about a minute. Household data is untouched.
5. Add the release to the "Household Forecast: Version History" doc.

## Rules that have bitten before

- Nothing may scroll sideways on a phone. Keep form fields at 16px on touch screens (iPhone zooms in on smaller ones).
- Firebase web keys in `js/config.js` are public by design. Protection comes from the Firestore rules and the code.
- `sw.js` never touches Firestore traffic.
