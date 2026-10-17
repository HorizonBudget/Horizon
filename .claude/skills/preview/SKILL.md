---
name: preview
description: Build and open a safe Horizon preview with demo data (never touches real data), so David can see a change before it is pushed.
---

Build a private preview for David. It never touches real data. Keep chatter short.

1. If this is a helper's work, run from that branch or worktree so the preview shows the change.
2. `node tools/make-preview.js` writes `preview/horizon-preview.html` (the app with the Firebase key blanked, signed in as "Preview" with demo items, and a bar at the bottom with Sage / Dots / Christmas / Halloween / Hide). It refuses to build if the key is not blanked; do not work around that.
3. Show it:
   - On David's computer: `open preview/horizon-preview.html` (Mac) or `start preview\horizon-preview.html` (Windows).
   - In a cloud session, or if David wants it on his phone: `node tools/make-preview.js --fragment preview/fragment.html`, then publish that as a private Artifact (one per change; reuse the same file path to update it).
   - Also take a 390px-wide screenshot with Playwright of the part that changed and show it, so he sees the phone view.
4. Tell David in one or two lines what to look at and where (which screen, which button). Say what does not work in a preview: installing, offline, real sync.
5. Wait for his OK before anything goes to `main`.
