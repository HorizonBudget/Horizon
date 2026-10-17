---
name: start
description: Fresh-session checklist for Horizon. Pull the latest code, check this computer has the tools the tests need, confirm a green test baseline, then ask David what he wants to work on.
disable-model-invocation: true
---

Run the Horizon fresh-session checklist. Keep chatter short; David is not a developer.

1. **Latest code.** `git status` and `git pull --rebase origin main`. If there are uncommitted changes or the pull fails, stop and explain in one or two plain sentences what you found and what you suggest.
2. **Where are we?** Read the top entry of `CHANGELOG` in `js/changelog.js` and `git log --oneline -5`. Compare with the version in `docs/handbook.md`; if the handbook is behind, note it and offer to update it.
3. **Tools on this computer.** Check `git --version`, `node --version` (need 18+), and Python 3 (`python3 --version`, or `python`/`py` on Windows). Check `tests/node_modules/jsdom` exists and Playwright imports (`python3 -c "import playwright"`). For anything missing, list it and offer to install it (Node.js and Python may need David to run an installer; give him the exact link and clicks; `npm install` in `tests/` and `python3 -m pip install --user playwright` then `python3 -m playwright install chromium` you can run yourself after he says yes).
4. **Green baseline.** Run the `test-runner` agent (or `node tests/run-all.js` plus `python3 tests/browser-smoke.py`). Expected: every suite passes. If something fails, rerun once (one known flake in `dialog-test.js`) before treating it as real.
5. **Version History doc.** Check whether Claude Docs tools are available in this session (needed for release step 6). Just note yes/no; do not set anything up.
6. **Open items.** Glance at section 12 of the handbook. If the iPhone checklist from 3.2.0 is still open, ask David how it went.
7. Report in at most five short lines: version, tests, anything missing, then ask what he wants to do next (multiple choice is welcome).
