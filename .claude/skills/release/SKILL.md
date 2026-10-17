---
name: release
description: Release a new Horizon version - changelog entry, version stamp, full tests, commit, push to main after David's OK, and update the Version History doc. Use when merged work is ready to go live.
argument-hint: "[X.Y.Z]"
disable-model-invocation: true
---

Release Horizon version $ARGUMENTS. Follow section 4 of `docs/handbook.md`; this is the checklist.

0. **Version number.** If none was given, propose one: middle number for features (3.2.0 -> 3.3.0), third number for fix-only (3.2.0 -> 3.2.1). Confirm with David if unsure.
1. **Previewed?** If anything visual or behavioral changed and David has not approved a preview of exactly this code, stop and run `/preview` first.
2. **Changelog.** Add a new entry at the TOP of `CHANGELOG` in `js/changelog.js`: `v`, `date` (today), `items` in plain family-friendly language. Add `ui` lines ONLY if people will see or do something differently (they pop up once in a dialog); leave `ui` out for behind-the-scenes work. Show David the lines in one short block.
3. **Stamp.** `python3 tools/release.py X.Y.Z`, then `python3 tools/release.py --check`.
4. **Test.** Use the `test-runner` agent: all jsdom suites, plus `browser-smoke.py` and `overflow-audit.py` when anything visual changed (and `sticky-audit.py` if headers, scrolling or dialogs changed). Everything must pass. Rerun once for the known `dialog-test.js` flake.
5. **Commit.** `git pull --rebase origin main`, commit on the release branch, merge into `main` (fast-forward if possible).
6. **Ask, then push.** Tell David in one line what will go live and ask "Push to the family now?". Only after a clear yes: `git push origin main`. It is live in about a minute.
7. **Version History doc.** If Claude Docs tools are available, update "Household Forecast: Version History" as in handbook section 4 step 6. If not, give David the finished `## X.Y.Z · date (current)` section in one block to paste at the top of the doc (and remind him to remove " (current)" from the previous heading).
8. **Report** in a few plain lines: what the family will see, what was tested, what could NOT be tested (real iPhone, live site, real Firebase). Ask him to open https://horizonbudget.github.io/Horizon/ to confirm.
9. **Tidy.** Delete merged agent branches and worktrees. Update `docs/handbook.md` (version line, release history, anything learned) and commit that too (it can ride along in the next push; ask before pushing again).
