# Getting Started with Terra Scutum (beginner guide)

This guide assumes **no game-making, GitHub or programming experience**. Everything happens **in your web browser**: you don't install anything. Claude Code writes the game in the cloud; your job is to give it instructions, **play each new version**, give feedback, and accept the work.

> Works on Windows, Mac or Linux, with any modern browser (Chrome or Edge recommended).

## How it fits together
```
 claude.ai/code             GitHub                         Cloudflare Pages
 Claude Code builds   →     your project's online   →      turns every version into a
 one feature at a time      home; you click "Merge"         link you open to play the game
                            to accept each feature
```
- **GitHub** stores your project online. Claude Code in the browser works on projects stored there.
- **Cloudflare Pages** (free) turns the project into a web page. Every new feature gets its **own preview link**, so you can play it **before** you accept it.
- **The game runs in your browser.** No downloads, ever.

---

## Part 1: One-time setup (about 30 minutes)

### 1. Create a GitHub account
1. Go to **github.com** and click **Sign up**. Follow the steps (email, password, username).
2. Verify your email when GitHub asks.

### 2. Create the project's repository (its online folder)
1. On github.com, click the **+** at the top right → **New repository**.
2. **Repository name:** `terra-scutum`
3. Choose **Private** (only you can see the code; the game links are still viewable by anyone you share them with).
4. Click **Create repository**. Keep the page open.

### 3. Upload the design docs
1. Unzip **terra_scutum_design.zip** on your computer (Windows: right-click → **Extract All**).
2. On your repository's page, click the link **uploading an existing file**.
3. Open the extracted folder, select **everything inside it** (`CLAUDE.md`, `GAME_DESIGN.md`, `GETTING_STARTED.md` and the `docs` folder) and **drag it onto the GitHub page**.
4. When the uploads finish, click the green **Commit changes** button.
5. Check: the repository page lists those three files and a `docs` folder.

### 4. Connect Claude Code to GitHub
1. Go to **claude.ai/code** and sign in with your Claude account.
2. It asks you to **connect GitHub**. Follow the prompts to install the **Claude GitHub App**. When GitHub asks which repositories, choose **Only select repositories** → **terra-scutum** → **Install**.
3. If it asks you to create an **environment**, keep the **Default** settings.
4. Check: on claude.ai/code, the repository selector (under the message box) lists **terra-scutum**.

### 5. Create a Cloudflare account (for the play links)
1. Go to **dash.cloudflare.com** and click **Sign up** (free). Verify your email.
2. **Stop there.** Claude Code will walk you through connecting it to your project in the first session, once there's a game to show.

---

## Part 2: Your first session

1. Go to **claude.ai/code**.
2. Under the message box, select **terra-scutum** (branch **main**).
3. Paste your **first prompt** (copy everything in the box):
   ```
   This is the first session for my game, Terra Scutum. We're in a Claude Code cloud session in the browser. Read CLAUDE.md and GAME_DESIGN.md first, then follow the "First session (start of M1)" steps in CLAUDE.md:
   1. Check the tools in this cloud environment and set up anything missing.
   2. F132 (core architecture) is one of the hardest parts (⚑), so take extra care.
   Then build F132 only. Read docs/12_feature_tracker.md, docs/13_technical.md and docs/15_open_questions_and_gaps.md (section 17.3) for it.
   After that, walk me through connecting Cloudflare Pages step by step so I get preview links.
   I'm a complete beginner (no programming or GitHub experience), so explain things simply and walk me through anything I need to do myself step by step.
   When F132 is done, push it, open the pull request, tell me how to check it on the preview link, then give me the next prompt.
   ```
4. Claude Code works in the cloud and may ask you questions.
5. **Approving actions:** Claude Code may ask permission before running commands. Read the short description and approve. If unsure, ask *"What does this do?"*
6. It will walk you through **connecting Cloudflare Pages** (a few clicks). After that, every pull request gets a play link automatically.

---

## Part 3: Your everyday loop (one feature at a time)

1. **Claude finishes a feature,** pushes it and opens a **pull request** (a request to add the new feature to your main project). It tells you what to test and gives you the **▶ Next prompt** (also saved in `NEXT_PROMPT.md`).
2. **Play it:** open the pull request on GitHub. Cloudflare posts a comment with a **preview link** (it can take a minute or two). Click it; the game opens in a new tab. Try what Claude told you to try.
3. **Give feedback** in the same session: *"Works great,"* or *"The camera zooms too fast,"* or *"The map colors are hard to read."* Claude fixes it, and the preview link updates.
4. **Accept it:** on the pull request page, click **Merge pull request** → **Confirm merge**. The main game link now has this feature.
5. **Next feature:** on claude.ai/code start a **new session** on **terra-scutum** (branch **main**) and paste the next prompt.
   - Always merge the previous feature **before** starting the next session.

**Good habits**
- **One feature per session.** Small requests work much better than "build the whole economy."
- **Say when you don't understand.** *"Explain that like I'm brand new"* is always fine.
- **Screenshots help.** If something looks wrong, take a screenshot (Windows: **Windows key + Shift + S**; Mac: **Cmd + Shift + 4**) and paste it into the session.
- **Your design decisions matter most.** If Claude asks how the game should work, that's your call.

---

## Part 4: Playing the game
- **Newest feature (not merged yet):** the **preview link** on its pull request.
- **Latest accepted version:** your main game link, `https://terra-scutum.pages.dev` (or similar; Cloudflare shows it after setup). Bookmark it.
- **Saves** are stored in your browser, **separately for each link**: a save made on the main link won't appear on a preview link, and vice versa. To move a save, use the game's **Export save** / **Import save** buttons. Clearing your browser data deletes saves, so export important ones.
- If the game feels slow, try **Chrome** or **Edge**, and close other heavy tabs.

---

## Part 5: When something goes wrong
- **The game shows an error or a blank screen:** take a screenshot and paste it into a session: *"The preview link shows this."*
- **The game looks or behaves wrong:** describe what you expected and what happened, with a screenshot.
- **A merged feature broke something:** start a session and say *"The last feature broke X. Fix it or go back to the previous version."* GitHub keeps every version.
- **Claude is going in circles on a bug:** tell it so; ask it to stop, explain what it has tried, and take a different approach.
- **A red ✗ appears on the pull request:** that's the automatic checks finding a problem. Don't merge; tell Claude: *"The checks failed on the pull request."*
- **Stuck on setup:** ask in Claude (chat) with a screenshot of what you see.

---

## Part 6: Words you'll hear (mini glossary)

| Word | What it means |
|---|---|
| **Repository (repo)** | Your project's online folder on GitHub |
| **Commit** | A saved version of some changes |
| **Branch** | A separate line of work. Claude does each feature on its own branch |
| **Pull request (PR)** | A request to add a branch's changes to the main project. Where you test and accept a feature |
| **Merge** | Accepting a pull request, so its changes join the main project |
| **main** | The main version of your project |
| **Preview link** | A link to play a pull request's version of the game before merging |
| **Checks / CI** | Automatic tests GitHub runs on every pull request (green ✓ = passed, red ✗ = problem) |
| **Cloud session** | One Claude Code conversation running on a cloud computer |
| **Environment** | The cloud computer's settings (network access, setup script) |
| **Simulation (sim)** | The part of the game that does all the math: economy, bugs, combat |
| **Campaign runner** | A tool that plays years of the game automatically to find crashes and balance problems |
| **Milestone (M1…) / feature (F01…)** | A stage of development / one piece of it (see `docs/12_feature_tracker.md`) |
| **⚑** | One of the hardest parts of the game: Claude proposes first and takes extra care (Claude Fable 5.2 is no longer used) |
