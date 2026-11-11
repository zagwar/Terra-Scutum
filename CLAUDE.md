# Project instructions

This is *Terra Scutum: The Last Line of Earth* (short form *Terra Scutum*): a 3D, top-down grand-strategy game that runs **in the web browser**, written in **TypeScript** with **Babylon.js** (3D) and **React** (UI). The simulation is a separate pure TypeScript package (`packages/sim`) that runs in a Web Worker in the game and in Node.js for tests. See `docs/13_technical.md`. The player controls one real-world country; all other countries are AI.

## Where you're running
- You run in **Claude Code cloud sessions** (claude.ai/code in the browser), on the designer's GitHub repository **terra-scutum**. The designer doesn't use Claude Code on his PC and has **nothing installed** except a web browser.
- **Tools:** Node.js and npm are pre-installed. Dependencies come from `npm install` (run it at the start of a session if `node_modules` is missing). For Playwright's headless Chromium: use an existing Chrome if one is installed; otherwise install it with Playwright. If any download is blocked by the environment's network allowlist, tell the designer exactly which setting to change, step by step (environment selector under the message box → edit environment → network access or **Setup script**). Prefer a **setup script** for anything that should be ready in every session, kept under about five minutes so the environment is cached.
- **Git and GitHub:** do each feature on its own branch, commit, and **push**. Then create the pull request if you can (otherwise tell the designer how: **Changes** panel → **Create PR**). Each new session starts from `main`, so the previous feature must be merged first; if it isn't on `main`, say so before doing anything else.
- **Playing the game:** every pull request gets a **Cloudflare Pages preview link** (posted on the PR by Cloudflare). The designer plays that link in his browser **before** merging. After merging, the main link has the latest version.
- **Models:** to use Claude Fable 5.2, the designer picks it as the model when starting a session.

## Working with the designer: a beginner
Kai (the designer) has **no game development, programming or GitHub experience** and is not expected to write code. You do the building; Kai tests, makes design decisions, and merges pull requests. His guide is `GETTING_STARTED.md`.
- **Plain language.** The first time you use a term (branch, pull request, merge, preview link, worker, component…), explain it in one short sentence.
- **When Kai has to do something himself** (a setting, a click on GitHub or Cloudflare), give **numbered step-by-step instructions**: exactly where to click and **what he should see if it worked**. One small step at a time.
- **After every feature, tell Kai how to try it:** open the **preview link** on the pull request, and exactly what to look at, click or press, and what should happen. Ask for his feedback **before** he merges.
- **Errors:** explain what went wrong in plain words, what you're doing about it, and whether Kai needs to do anything.
- **Never leave Kai with broken work.** If a feature can't be finished in a session, push what's done on its branch, tell Kai **not** to merge it yet, and put what's left in the next prompt.

## Design doc
- The design is split into an index (`GAME_DESIGN.md`) and one file per system in `docs/`.
- At the start of every task, read `GAME_DESIGN.md`, then **only the `docs/` files the task needs** (the index has a "Which files to read" guide). Always check `docs/12_feature_tracker.md` and `docs/13_technical.md`.
- Use the terms from the glossary in `GAME_DESIGN.md` in code, data and docs.
- Only build what the design or the current prompt asks for. If they disagree, or something is missing, ask before coding. Items marked [DEFAULT] can change, so keep them in data, not hard-coded.
- Systems listed as not designed in `docs/15_open_questions_and_gaps.md` get simple placeholders marked [DEFAULT]; don't invent full designs for them, and say so in your reply.

## Reminders for the designer
These parts of the game are intentionally left for the designer (Kai) to write. **Remind him at the right time, and don't write these yourself:**
- **Lore** (what Object Alpha is, where the Swarm comes from, why it came, what the player learns): remind him **before starting M7**, or earlier if a task needs lore (story events, xenobiology insights with story content, ending texts). Until it's written, use neutral placeholder text marked [LORE NEEDED].
- **Music and sound:** remind him **at the start of M11**, or earlier if a task involves audio. Until then, no music; simple placeholder sounds only if a feature needs them.
When you give a reminder, say briefly what's needed and why it matters for the upcoming work, then wait for his answer before building anything that depends on it.

## Model reminders (Claude Fable 5.2)
The designer has **limited access to Claude Fable 5.2** and wants to save it for the hardest parts. Features marked **⚑ Fable** in `docs/12_feature_tracker.md`:
- **Foundations (M1):** core architecture (F132): the monorepo, sim/worker/UI split, data schemas, the daily tick, determinism, performance budget, save versioning, CI and tests
- **Map and rendering architecture (M1–M2):** terrain, map rendering, LOD and procedural building placement (F125, F126)
- **Economy core (M2):** pops, markets and prices, building recipes (F06, F65, F07)
- **Country AI (M6):** F25
- **Swarm AI (M7):** F105
- **War (M8a):** the supply chain (F75), the combat model (F77) and front-line/battle-plan AI (F78)
- **Save system (M10):** F40
- **Also worth switching for:** a bug still not fixed after two or three attempts, a big performance problem, or a major refactor.

**When to remind:** before starting a ⚑ Fable feature (or one of the "also worth switching for" situations), if you are **not** running as Claude Fable 5.2, stop and tell the designer: *"This is a ⚑ Fable task ([feature]). Consider starting a new session with Claude Fable 5.2 selected and pasting this same prompt."* Then wait for him to switch or tell you to continue. When the ⚑ Fable work is done, mention he can go back to his usual model.

## End every finished piece of work with the next prompt
The designer works **one feature per cloud session**, and a new session doesn't remember the old one, so **you write his next prompt for him.**
- **When:** at the end of every finished feature, at the end of a milestone, and whenever a session has to stop partway.
- **Where:** at the very end of your reply under the heading **"▶ Next prompt"** in a code block he can copy, **and** saved to `NEXT_PROMPT.md` in the project root (overwrite it each time), committed with the feature.
- **What the prompt must contain** (so a fresh session can continue with no memory of this one):
  - The next feature's id and name, its milestone, and the docs files to read (for example: "Build F02 (countries layer, M1). Read GAME_DESIGN.md, docs/02_world_and_characters.md, docs/12_feature_tracker.md and docs/13_technical.md.")
  - Anything left unfinished, or any decision the designer just made that the next session needs to know
  - "I'm a beginner, so walk me through anything I need to do myself step by step."
  - "When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt."
- **Before the code block,** tell the designer in one line:
  - to play the **preview link**, then **merge the pull request** (step by step: **Merge pull request** → **Confirm merge**), then start a **new session** on `terra-scutum` / `main` and paste the prompt
  - if the next feature is **⚑ Fable**: to choose **Claude Fable 5.2** as the model for that new session
  - if a **reminder** is due (lore before M7, music at M11): that it's time, and that the next prompt can't start until it's handled
- **At the end of a milestone,** the next prompt starts the next milestone, and you give a short summary of what the finished milestone added.

## First session (start of M1)
1. **Check the cloud tools** (`node --version`, `npm --version`, `check-tools`) and whether a headless Chromium is available for Playwright. Set up anything missing (see "Where you're running").
2. **Remind the designer about ⚑ Fable** before starting F132.
3. Build **F132** first: the repository structure, tooling, CI and test setup in `docs/13_technical.md`, with a minimal game page that shows an empty 3D scene, so the preview link works.
4. **Walk the designer through connecting Cloudflare Pages** to the repository (step by step, with the exact build settings: build command, output folder, Node version), so pull requests get preview links. Confirm the preview link works on the F132 pull request.
5. Then continue with the rest of M1 in the build order from the feature tracker, one feature per session.

## How to work
- Work milestone by milestone (`docs/12_feature_tracker.md`), **one feature per session**. Don't start features from a later milestone unless asked. M8 is split into M8a, M8b and M8c.
- Keep all game logic in `packages/sim`, with no browser, Babylon or Node-only code in it.
- **Before opening a pull request:** `npm run check` (typecheck, lint, data validation) and `npm test` must pass; run the campaign runner for sim changes; for anything visible, run the Playwright tests, **take screenshots and look at them**. Only then mark the feature `Done` in the feature tracker and log any design decisions in `docs/14_decision_log.md`.
- **Commit** with a short message naming the feature id (for example `F65: national markets`). Never leave `main` broken: only finished, tested work goes into a pull request.
- Keep the game runnable after every change. There are **no hand-made 3D assets**: all models, materials and effects are **generated by code** (section 12.6). Start each generator simple and improve it later.
- Put all player-facing text through translation keys (`locales/en.json`); the sim returns keys, never finished sentences.
