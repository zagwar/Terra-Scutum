# Terra Scutum Design: Technical notes (web: TypeScript + Babylon.js)

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 14. Technical Notes (TypeScript + Babylon.js, built for Claude Code in the browser)

**Why this stack:** all development happens in **Claude Code cloud sessions** (claude.ai/code) on the GitHub repository `terra-scutum`. The stack is chosen so that Claude Code can **build, run, test and see** the game inside the cloud machine, and so the designer can **play every version in his web browser with nothing installed**.
- The cloud machine already has **Node.js** and Chrome tooling, so no toolchain needs installing.
- The game runs in a **web browser**, so Claude Code can open it in a headless browser, click around and **take screenshots** to check its own work.
- Every pull request gets its **own preview link** (Cloudflare Pages), so the designer plays a feature **before** merging it.
- Everything is plain text files (code, data, scenes built in code), which is what Claude Code works with best.

### Stack [DEFAULT]
| Part | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict mode) everywhere | One language; strong types catch mistakes early; the best-supported language for this kind of work |
| 3D engine | **Babylon.js** (WebGPU when available, WebGL2 fallback) | Full game engine in the browser: instancing (thin instances), LOD, shadows, particles, PBR materials, picking; TypeScript-first |
| UI (menus, panels, tooltips) | **React** as an HTML layer on top of the 3D canvas | Grand-strategy UI is huge (dozens of screens, nested tooltips, tables); HTML/CSS is far better at this than in-engine UI |
| Simulation | **Pure TypeScript package** with no browser or Babylon code, running in a **Web Worker** in the game and in **Node.js** for tests and the campaign runner | Keeps the heavy daily tick off the rendering thread; testable without a browser |
| Build tool | **Vite** | Fast builds and dev server; handles workers and assets |
| Packages | **npm workspaces** (monorepo) | Simple; works out of the box in the cloud machine |
| Data validation | **zod** schemas for every JSON data file | Bad data fails loudly at load time with a clear message |
| Unit tests | **Vitest** | Fast, TypeScript-native |
| Browser and visual tests | **Playwright** (headless Chromium) | Opens the real game, sends input, takes screenshots |
| Saves | **IndexedDB** in the browser, plus export/import as a file; compressed JSON (fflate) with a save-format version | Saves persist between sessions; players can back them up |
| Translation | Translation keys + a small i18n layer (all text in `locales/en.json`) | Ready for other languages later |
| Hosting | **Cloudflare Pages** (free) connected to the GitHub repo | The private repo stays private; `main` deploys to the main link; **every pull request gets a preview link** |
| Desktop release later | Wrap the web build with **Tauri** or **Electron** for Steam | Same game, packaged as a normal desktop app |

If one part of the sim ever proves too slow in TypeScript even after optimization, that part can be rewritten in **Rust compiled to WebAssembly** (Rust is pre-installed in the cloud machine). Don't do this up front.

### Repository structure
```
terra-scutum/
├── CLAUDE.md, GAME_DESIGN.md, GETTING_STARTED.md, NEXT_PROMPT.md
├── docs/                      # the design doc
├── package.json               # npm workspaces root; scripts: dev, build, test, test:e2e, runner, check
├── packages/
│   ├── sim/                   # PURE TypeScript simulation (no DOM, no Babylon, no Node-only APIs)
│   │   ├── src/core/          #   GameState, daily tick, seeded RNG, commands, save/load, sim events
│   │   ├── src/world/         #   regions, countries, provinces, sea zones
│   │   ├── src/economy/       #   pops, buildings, recipes, markets, corporations, budget, construction
│   │   ├── src/politics/      #   laws, ideologies, interest groups, movements, elections
│   │   ├── src/military/      #   units, supply, combat, designers, operations
│   │   ├── src/swarm/         #   hives, spread, Swarm intelligence, evolution
│   │   ├── src/diplomacy/     #   relations, espionage, UN
│   │   ├── src/research/      #   techs, xenobiology
│   │   ├── src/events/        #   events, journal entries, decisions, news generation
│   │   ├── src/ai/            #   country AI
│   │   ├── src/data/          #   zod schemas and loaders for the JSON data
│   │   └── test/              #   Vitest tests
│   ├── game/                  # the browser game (Vite app)
│   │   ├── src/worker/        #   Web Worker that hosts the sim and runs ticks
│   │   ├── src/render/        #   Babylon.js: map, terrain, cities, units, effects, battle view, camera
│   │   ├── src/ui/            #   React: top bar, outliner, lenses, screens, tooltips
│   │   ├── src/generators/    #   3D asset generators (section 12.6)
│   │   ├── src/debug/         #   debug/test hooks (scenario loading, camera presets) used by Playwright
│   │   ├── public/            #   static files served as-is
│   │   └── e2e/               #   Playwright tests and screenshot baselines
│   ├── runner/                # Node CLI: headless campaign runner (`npm run runner -- --days 3650 --seed 42`)
│   └── tools/                 # Node CLIs: map import, terrain processing, data generation and validation
├── data/                      # all game data as JSON (regions, countries, provinces, sea zones, buildings, goods, techs, units, bugs, events…)
├── locales/en.json            # all player-facing text
└── .github/workflows/         # CI: typecheck, lint, unit tests, data validation, e2e tests on every pull request
```

### How the parts talk
- The **sim worker** owns `GameState`. The UI and renderer send it **commands** (build, move army, pass law, set speed) and receive **state snapshots/updates** and **sim events** (`provinceControlChanged`, `relationsChanged`, `nukeLaunched`, `hiveTierUp`…) by message passing.
- Per-province numbers live in **typed arrays** (for example `Float32Array` of population per province) so they're fast to compute and cheap to send. Send only what changed, or what's on screen, each tick **[DEFAULT]**.
- The sim never touches the DOM, Babylon or the network. The game never changes sim state directly; everything goes through commands. That keeps the sim deterministic and makes saves, replays and (later) multiplayer possible.

### Map data [DEFAULT]
- Build provinces from public-domain map data (for example Natural Earth's first-level administrative boundaries). The import tool in `packages/tools` simplifies outlines, merges small ones to hit the target province count, computes adjacency, and writes `data/provinces.json`, `data/countries.json`, `data/regions.json`, `data/sea_zones.json` plus compact geometry files.
- **Source downloads:** if the cloud machine can't download a source file (network allowlist), the tool says which file and the designer either allows that domain in the environment settings or uploads the file to the repo. Large source files are processed once, and only the much smaller game-ready output is committed.
- **Hosting limits (Cloudflare Pages free plan):** files up to 25 MiB, up to 20,000 files per site, and 500 builds per month. Terrain and geometry are split into **tiles/chunks** (also how they're streamed by zoom level), and Claude Code pushes at the end of a feature and after fixes, not after every small change.

### Rendering a living map [DEFAULT] (art direction in section 12.5)
- **Flat 3D map** (not a globe), like HOI4, with an angled top-down camera (Babylon `ArcRotateCamera` or a custom strategy camera).
- **Provinces:** extruded polygon meshes or a terrain-draped province ID texture; selection by picking against a province ID map (fast, works for ~1,000+ provinces). Map-mode overlays are a shader that colors provinces from a per-province value texture, so switching modes is instant.
- **Terrain** from public elevation and land-cover data, processed by the tools into chunked height and material tiles with several detail levels.
- **Buildings are placed procedurally** inside their province (city center and placement zones: urban, industrial, rural, coastal). The sim only knows "province X has 3 levels of steel mill"; positions are visual only and never affect the sim.
- **Cities** are assembled from generated district pieces whose count and size follow population and buildings.
- **Infrastructure lines** (rail, roads, power lines) are generated along routes between cities and upgraded visually as the sim's infrastructure level rises.
- **Performance is critical:** use **thin instances** for repeated objects (buildings, trees, infantry, bug hordes), aggressive **LOD** (icons → simple models → detailed models), frustum culling, and animate only what's on screen. Far zoom shows aggregated city clusters. Target **60 FPS on a mid-range PC** at strategic zoom **[DEFAULT]**.
- **Moving things** (trains, convoys, refugee columns, ships, aircraft) are visual representations of sim flows, spawned only near the camera.
- **Models come from data:** each unit design, building type and bug type points to a generator (section 12.6).

### Battle view and map units [DEFAULT]
- The battle view is a **separate Babylon scene** opened when the player zooms into a battle. It reads the battle's state from the sim and animates it, and it **never changes the outcome**.
- Large groups use thin instances, simple procedural animation and LOD. Only the battle being watched gets full detail.
- Map units are low-detail models or icons that switch to animated "fighting" poses when their province has a battle.

### Architecture rules
- **Simulation separate from presentation.** All game logic lives in `packages/sim` and runs in Node and in a Web Worker. This lets the whole campaign run headless for testing.
- **Data-driven.** All content and balance numbers live in `data/` as **JSON**, validated with **zod** at load time (unknown ids, missing fields and bad references are errors with clear messages). A `npm run check:data` script validates everything.
- **A single daily tick.** `GameState.advanceDay()` runs every system in a fixed order (the worker calls it according to game speed): weather → population → energy → resource production (farms, mines) → industry (factories, construction) → trade → food consumption → budget/treasury → power grid and blackouts → military production and upkeep → supply transport and depots → public opinion → diplomacy/AI → Swarm growth → spread → laser coverage → disruption decay → joint operations → combat → refugees → fallout and pollution → stability → research → events, journal entries and decisions → news → win/lose check.
- **Performance:** every country runs the full economy. Use typed arrays and plain objects in hot loops; avoid allocating in the daily tick. Heavier calculations (market prices, pop job changes, corporation decisions, AI planning) run **weekly**. Profile the tick early with the campaign runner.
- **Player and AI use the same sim commands.**
- **Seeded RNG.** All randomness in the sim uses one seedable generator owned by `GameState` (a fixed algorithm such as a PCG or xoshiro variant). **Never use `Math.random()` in the sim.** Runs are reproducible from a seed.
- **Determinism:** avoid iteration over unordered collections when order affects results; sort by id.

### Code conventions
- TypeScript **strict** mode; ESLint + Prettier; `npm run check` (typecheck + lint + data validation) must pass before any pull request.
- `camelCase` for variables and functions, `PascalCase` for types, classes and React components, `kebab-case` for file names.
- `packages/sim` may not import anything from `game`, browser APIs or Babylon. ESLint rules enforce this.
- Small, focused modules; one system per folder; public APIs documented with short comments.
- No player-facing text in code: use translation keys from `locales/en.json`. The sim returns **keys and parameters** (for example `NEWS_PROVINCE_FALLEN` + province id), never finished sentences.

### Scope for release
Single-player only. **No multiplayer, modding support or extra languages for now**; they may be added after release. To keep that door open cheaply: content in data files, all text through translation keys, and a deterministic sim separate from the UI.

### Save system
The sim serializes `GameState` (with a **save format version**) to compressed JSON. The game stores saves in **IndexedDB** and offers **Export save / Import save** as files. Saves from older versions are migrated or rejected with a clear message (M10).

### Testing
- **Unit tests:** Vitest tests for every sim system (`packages/sim/test`), run with `npm test`. No browser needed; they run in seconds.
- **Headless campaign runner:** `npm run runner -- --days 3650 --seed 42` simulates N days with AI controlling every country, including the player's, and prints a summary (Swarm control %, population, hive tiers, refugees, relations, nukes used, **average and worst tick time**). Use it to catch crashes, runaway numbers and balance problems, and to check the performance budget.
- **Browser and visual tests:** Playwright opens the real game in headless Chromium, loads a test scenario through debug hooks (`?debug=scenario-name`), moves the camera, clicks, and **saves screenshots**. Claude Code **looks at the screenshots** to check the result (missing models, wrong colors, broken layout, overlapping text). Stable views can also be compared against saved baseline images to catch accidental visual changes.
- **Rendering in the cloud:** headless Chromium renders with a software graphics backend (WebGL through SwiftShader), which is slow but enough for screenshots. If it can't render a scene, say so and ask the designer to check the preview link.
- **CI:** GitHub Actions runs typecheck, lint, data validation, unit tests and e2e tests on every pull request, so problems show up on the PR page. Private repositories on GitHub Free get a limited number of Actions minutes per month, so keep the CI run short (target under about 5 minutes; cache npm and the Playwright browser).
- **Preview link:** every pull request gets a Cloudflare Pages preview link. The designer plays it before merging.
- **What only the designer can test:** whether it's **fun**, whether it **feels** right, and whether it matches the vision.

### What F132 built (where things are)
The foundations from this section exist as of F132. A quick map for later features:
- **Commands (run from the repository root):** `npm run dev` (local dev server), `npm run build` (builds the game into `packages/game/dist`), `npm run check` (typecheck + lint + data validation), `npm test` (Vitest unit tests for all packages), `npm run test:e2e` (builds, then Playwright in headless Chromium on both renderers; screenshots land in `packages/game/e2e/screenshots/`), `npm run runner -- --days 3650 --seed 42` (campaign runner; `--strict` fails if over the performance budget), `npm run format` (Prettier).
- **Sim core (`packages/sim/src/core`):** `game-state.ts` (`GameState`, `advanceDay()`), `systems.ts` (`TICK_ORDER` and the `SYSTEMS` registry: add a system by putting it in its slot; a system has an optional `daily` and an optional `weekly` step), `rng.ts`, `calendar.ts`, `commands.ts` (add a command: extend the `SimCommand` type and add its handler), `events.ts` (`SimEvent`), `snapshot.ts` (what the worker sends to the game), `save.ts` (save format version and migrations; `hashGameState` for determinism tests), `sim-error.ts` (errors as translation keys).
- **Data (`packages/sim/src/data`):** one zod schema per data file, listed in `DATA_FILES` in `game-data.ts`. To add a data file: write the schema, add it to `DATA_FILES` and `GameData`, add a cross-check if it refers to ids in other files, and add the JSON import to `packages/game/src/worker/game-data.ts`. The runner and tools read the same files from disk (`packages/tools/src/load-data.ts`).
- **Game (`packages/game/src`):** `main.tsx` starts the three parts; `worker/` (the sim worker, its message protocol, and `sim-client.ts` for the main thread; the logic is in `sim-host.ts` so it can be unit tested); `render/` (engine creation with WebGPU → WebGL 2 fallback, the placeholder scene); `ui/` (React, `i18n.ts`, styles); `app-store.ts` (the small store React reads); `debug/` (`?debug=<scenario>` and the `window.__terraScutum` test hooks).
- **Tests:** `packages/*/test` (Vitest) and `packages/game/e2e` (Playwright). New sim systems get unit tests plus, where useful, a determinism check with `hashGameState`.
- **Hosting:** Cloudflare Pages builds with `npm run build` and serves `packages/game/dist`; Node version comes from `.nvmrc`.
