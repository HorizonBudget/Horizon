# Moving Horizon to Claude Code on your computer

One-time setup, about 20 minutes. After this, you open the **Horizon** folder on your Desktop in Claude Code and just talk to it like you did in the claude.ai Project. It already knows your rules, the handbook and the release steps.

You need a paid Claude plan (Pro or Max). The free plan does not include Claude Code.

---

## Step 1. Install the tools (once)

Pick your computer.

### Mac
1. Open **Terminal** (press Cmd + Space, type `Terminal`, press Enter).
2. Paste this and press Enter. If a box pops up asking to install "command line developer tools", click **Install** and wait for it to finish (this gives you git and Python):
   ```
   xcode-select --install
   ```
3. Install **Node.js**: go to https://nodejs.org, download the **LTS** version, and run the installer (click Continue until it finishes).
4. Install **Claude Code**: paste this into Terminal and press Enter. It shows no progress for a minute; that is normal.
   ```
   curl -fsSL https://claude.ai/install.sh | bash
   ```
5. Close Terminal and open a new one. Type `claude --version` and press Enter. You should see a version number.

### Windows
1. Install **Git for Windows**: https://git-scm.com/downloads/win (click Next through the installer; the defaults are fine).
2. Install **Node.js**: https://nodejs.org, download the **LTS** version, run it with the defaults.
3. Install **Python**: https://www.python.org/downloads/ and on the first screen of the installer tick **"Add python.exe to PATH"** before clicking Install.
4. Open **PowerShell** (Start menu, type `PowerShell`, press Enter) and paste this to install **Claude Code**:
   ```
   irm https://claude.ai/install.ps1 | iex
   ```
5. Close PowerShell and open a new one. Type `claude --version` and press Enter. You should see a version number.

> Prefer not to use a terminal at all? The Claude desktop app has a **Code** section that runs Claude Code in a window. You still need steps 1 to 3 above (git, Node, Python) for the tests, but you can skip installing the `claude` command and do Step 2 below by asking Claude in the app to clone the repo for you.

---

## Step 2. Put Horizon on your Desktop (once)

In Terminal (Mac) or PowerShell (Windows), paste these two lines:
```
cd ~/Desktop
git clone https://github.com/horizonbudget/horizon Horizon
```
(Windows with OneDrive: if the folder does not show on your Desktop, use `cd ~/OneDrive/Desktop` instead.)

You now have a **Horizon** folder on your Desktop. That folder *is* the app, and it is linked to GitHub.

The first time you push a release, GitHub will ask you to sign in (a browser window opens). Sign in with the account that owns `horizonbudget`. You only do this once per computer.

---

## Step 3. Start Claude Code in the folder

Every time you want to work on Horizon:
```
cd ~/Desktop/Horizon
claude
```
The first time, Claude Code opens your browser to sign in with your Claude account, and asks whether you trust this folder. Say **yes**.

Then type:
```
/start
```
Claude will pull the latest code, check your computer has everything the tests need (and offer to install what is missing, like the test browser), run the tests, and ask what you want to work on.

---

## Day to day

| You type | What happens |
| --- | --- |
| Anything, in plain words | "Add a way to mark an item as paid by Grandma", "The header is jumpy on my phone". Claude asks questions if needed, then hands the work to helper agents. |
| `/preview` | Builds a safe preview with demo data and opens it in your browser. Nothing touches your real household. |
| `/release` | Writes the changelog, stamps the version, runs every test, and **asks you** before publishing to the family. |
| `/start` | Use at the start of each new session. |

Good to know:
- Claude will always ask before it pushes to `main` (that is what publishes to everyone).
- Your family's data lives in Firebase, not in this folder. Nothing you do here can erase it.
- Your old claude.ai Project still works for chatting, but new work should happen here so everything stays in one place.
- The handbook is now `docs/handbook.md` in this folder. Claude keeps it up to date.

## If something goes wrong
- **`claude: command not found`** (or "not recognized"): close the terminal window and open a new one. Still failing? Run the install command again.
- **`git: command not found`**: on a Mac rerun `xcode-select --install`; on Windows reinstall Git for Windows.
- **Anything else**: start `claude` in the folder and paste the error. It can usually fix it for you.
