# Terra Scutum Design: Open questions

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 16. Open Questions

- **Curated playable list:** every included country is playable for now. Look into narrowing it to a curated list of playable countries later.
- **Exact country list and province count:** which countries make the curated list, and the final province count (about 1,000, leaning higher).
- **Goods list:** confirm the final list of about 30 goods and the pop groups.
- **Balance numbers:** lose thresholds, refugee rates, nuke effects, market behavior. Tune after playtesting with the campaign runner.

## 17. Gaps and Content To Fill In

> **For Claude Code:** the items below are **not designed yet**. Don't invent full
> designs for them. If a task depends on one, build the simplest placeholder,
> mark it **[DEFAULT]**, and say so in your reply.

### 17.1 Overlooked systems (need a design decision)
All system design decisions have been made (2026-11-11). Resolved items are kept below for reference.

**Needed soon (before or during the milestone listed)**
- [x] **Start date and starting tech level:** January 2025, with real-world 2025 starting data.
- [x] **Sea zones:** added (section 4.5).
- [x] **Political system:** government types, economic systems, political capital and elections (sections 8.12–8.13).
- [x] **Supply and logistics:** added (section 5.5).
- [x] **Combat model:** HOI4 + Total War (section 5.6). Exact numbers are still to be tuned.
- [x] **Army control:** HOI4-style front lines and battle plans, plus a battle view (section 5.7).
- [x] **Battle view control level:** watch-only, with an Attack/Defense Planner (section 5.7).
- [x] **Air zones:** bases with range, air superiority per region, operation focus (section 5.4.5.1).
- [x] **How space is shown:** an orbit view with orbit bands, plus launch arcs on the map (section 5.4.6).
- [x] **Space scope:** the Moon is in scope as an expensive megaproject (section 5.4.6). Beyond the Moon is out of scope.

**Needed later**
- [x] **Characters:** heads of state, ministers, lead scientists and CEOs (section 4.7); pilots, aces and commanders (section 5.3).
- [x] **Pilot pipeline:** separate pool, academies, training times (section 8.7). Exact numbers to be tuned.
- [x] **Swarm AI:** learning, scouting, escalating waves toward biomass (section 10.2.1).
- [x] **Reconstruction and return:** section 9.1.
- [x] **Late-game pacing:** the hunt for the Super Hive, extermination, and endgame politics (sections 3.4, 10.1).
- [x] **Global institutions:** the UN (section 6.4).
- [x] **Pre-landfall knowledge:** locked techs unlock through trigger events; mechs start only after landfall (section 11.3).
- [x] **Phase 3 trigger:** first tier-5 hive destroyed.
- [x] **Peacetime migration:** migration law (section 8.8).
- [x] **Game setup options:** section 3.0.
- [x] **Tutorial and onboarding:** section 12.
- [x] **Endings:** multiple endings decided by world state (section 3.3).
- [x] **UI details:** HOI4/Victoria 3-inspired layout, alerts, outliner, lenses, map modes, nested tooltips, ledger (section 12).
- [x] **Scope:** no multiplayer, modding or extra languages for now (section 14).

### 17.2 Content to write (data and lists)
- [ ] **Curated country list**, with each country's starting data: population, economy, provinces, government, interest groups, ideology mix, opinion split, nuclear status, AI personality. *(F64: the country list itself is approved: 172 countries in `packages/tools/map-config/countries.json`. Starting data comes with F71.)*
- [x] **About 1,000 provinces**, generated from map data, plus **about 50 named regions** with climate. *(F64: 1,422 provinces on real borders, 62 regions, 126 sea zones, all [DEFAULT] and adjustable in `packages/tools/map-config/`. Some combined provinces still have direction names ("Northern Algeria") that can be replaced with real names over time.)*
- [ ] **Building catalog stats** (section 8.3) with costs, workers, inputs, outputs and slots.
- [ ] **Goods list** (about 30) and the **pop groups**, final.
- [ ] **Recipes** for every building (inputs, outputs, workers, electricity, production methods).
- [ ] **Laws list** with every level's effects.
- [ ] **Ideologies** (final list) with stances on every law level, government type, economic system and issue; **interest groups** with base ideologies and which pops support them.
- [ ] **Full tech tree:** every branch, tech costs, prerequisites, **variants**, and which **insights** they need.
- [ ] **Insights list** and the **experiments** that produce them.
- [ ] **Designer content** for all six designers (mech, tank, aircraft, ship, spaceship, space station): bases and modules with stats.
- [ ] **Unit stats** for every land, sea, air and space unit, and **division template** rules.
- [ ] **Counter matrices:** units vs bugs, and units vs human units.
- [ ] **Bug roster:** final names, stats and lore; the **Swarm evolution tree**; Swarm structures.
- [ ] **Events, journal entries and decisions** (section 3.1): Phase 0 and opinion events, crises, stability events, corporation and character events, story and lore beats.
- [ ] **News templates** (section 3.2): headline variations for every type of story.
- [ ] **Name lists** for characters and units by country.
- [ ] **Ending texts and epilogues** for every ending (section 3.3).
- [ ] **Lore:** what Object Alpha is, where the Swarm comes from, why it came, and what the player gradually learns. **Written by the designer; Claude Code reminds them before M7** (or earlier if a task needs it).
- [x] **Game title:** *Terra Scutum: The Last Line of Earth*.
- [x] **Art direction:** realistic graphics; HOI4-style map with visible cities, buildings, infrastructure, units and bugs (section 12.5).
- [ ] **Music and sound:** designed later; Claude Code reminds the designer at M11 (or when audio work comes up).
- [x] **Art assets:** all 3D assets are generated by code (section 12.6). Any of them can be replaced by a real model later through one data entry.
- [ ] **Balance numbers** for everything marked **[DEFAULT]**, tuned with the campaign runner.

### 17.3 Technical prep
- [x] **Tiny provinces (found in F01; decided and built in F02):** four provinces were smaller than the map data's precision, so they could not be seen or clicked. Designer decision: **Vatican City, Gibraltar and the British Indian Ocean Territory are enlarged** to a small disc (10 km radius **[DEFAULT]**) at their real place, as Paradox games do with microstates, and keep their real area in the data; **Rose Atoll is left out** of the game. The list is `packages/tools/map-config/tiny-provinces.json`, and the import warns if another province ever comes out without a visible shape. The label points (`center`) that lay outside their province are fixed too: every province's label point is now the point of its shape farthest from its outline.
- [ ] **Data file schemas:** the exact fields for each JSON data file (regions, countries, provinces, sea zones, buildings, goods, techs, units, bugs, events). Define each schema when its system is first built; regions, countries, provinces and sea zones in M1. *(F64: regions, countries, provinces and sea zones done, in `packages/sim/src/world/world-data.ts`.)* *(F132 built the framework: each data file has a zod schema listed in `packages/sim/src/data/game-data.ts`; the first file is `data/game_config.json`.)*
- [x] **Glossary:** a starter glossary is in `GAME_DESIGN.md`. Add terms as new systems are built.
- [ ] **Performance budget:** **[DEFAULT target, to verify in M1]** daily tick ≤ 30 ms on average and weekly calculations ≤ 150 ms on a mid-range PC, with ~1,000 provinces and every country simulated, so the top game speed can run several days per second. The campaign runner reports tick times. *(F132: the targets live in `data/game_config.json`; the runner reports daily and weekly tick times against them and CI fails if they're exceeded. Still to verify with real data at the end of M1.)*
- [x] **Save format versioning**, so saves survive game updates. *(F132: save format version 1 with a migration chain in `packages/sim/src/core/save.ts`; storing, compressing and export/import are F40.)*
- [x] **Repository setup:** create the monorepo described in section 14 (sim, game, runner, tools; tests; CI; Cloudflare Pages previews) as the first step of M1 (F132).
