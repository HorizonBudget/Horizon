# Horizon: instructions for Claude Code

You are helping David (a non-developer who builds this for his family) keep developing **Horizon**, a shared "future expenses" planner that sits alongside EveryDollar. Plain HTML/CSS/JS, synced between devices by a household code in Firebase Firestore (no accounts), hosted free on GitHub Pages.

- Live app: https://horizonbudget.github.io/Horizon/
- Repo: https://github.com/horizonbudget/horizon (branch `main` is what is published; a push to `main` goes live in about a minute)
- This folder is the repo. The full handbook (architecture, release steps, tests, gotchas, open items) is imported below; read it before starting work.

## How David wants you to work
1. **Ask before building when it matters.** If a request is ambiguous or costly to redo, ask first (multiple choice is great). If it is clear, just start.
2. **Preview before pushing.** For anything that changes how the app looks or behaves, build a private preview (`/preview`) and open it for David, then wait for his OK before pushing to `main`. Never push a visual change he has not seen.
3. **Give the work to agents.** Implementation goes to subagents in isolated git worktrees (one branch each), with short, clearly scoped tasks, so David can message you at any time. Parallelize independent pieces. You review, test and merge.
4. **Every release keeps three things in sync:** the new entry at the top of `CHANGELOG` in `js/changelog.js`, the version stamped by `python3 tools/release.py X.Y.Z`, and the Claude Docs doc "Household Forecast: Version History". Middle number for feature releases, third number for fix-only releases. Use `/release`.
5. **Run the tests before every push** (all jsdom suites, plus the real-Chromium scripts when anything visual changed). Report honestly what could NOT be tested (real iPhone, the live site, real Firebase).
6. **Never add a new top-level synced field** to the Firestore household document (the security rules reject it). New data goes inside an item/person object or in per-device localStorage.
7. **Nothing may scroll sideways on a phone**, and form fields stay 16px on touch screens.
8. Plain language with David. Short summaries, no long recaps. Tell him what changed in terms of what he will see. When you need him to do something on his computer, give exact clicks or one command to paste.
9. David does not want reCAPTCHA / App Check right now. Do not bring it up unless something changes.
10. **Always ask before `git push`.** Pushing to `main` publishes to the family. Once David says yes to a push, anything else he asks for in that same round rides along: finish it, bundle it into the same release, and push it all when he stops adding, without asking again. A new round of work after that push needs a new yes.

## Shortcuts in this folder
- `/start`: fresh-session checklist (pull latest, check tools, green test baseline, ask what's next).
- `/preview`: build and open a safe preview with demo data (never touches real data).
- `/release X.Y.Z`: changelog, version stamp, tests, commit, push (after David's OK), Version History doc.
- `test-runner` agent: runs every test and reports in plain language.
- Area helpers `looks-themes`, `items-board`, `sync-household`, `scrolling-dialogs`, plus `reviewer`: see handbook section 8. Every helper reads `docs/agent-rules.md` first.

@docs/handbook.md
