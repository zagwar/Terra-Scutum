# Terra Scutum Design: Feature tracker and milestones

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 13. Feature Tracker

**⚑ Fable** marks features where the designer should switch Claude Code to **Claude Fable 5.2** (limited access, so it's saved for the hardest work). See "Model reminders" in `CLAUDE.md`.

Status values: `Planned` → `In progress` → `Done` (or `Cut`). Build in milestone order.

| ID | Feature | Milestone | Status | Notes |
|---|---|---|---|---|
| F132 | Core architecture: npm-workspaces monorepo (sim, game, runner, tools), sim in a Web Worker, React UI shell, Babylon scene, data loading with zod schemas, daily tick, seeded RNG, performance budget, save versioning, Vitest + Playwright + CI, Cloudflare Pages previews | M1 | Done | Section 17.3; build first; **⚑ Fable: foundations**. Implementation notes: section 14 "What F132 built". The page shows a temporary "Foundation check" panel until F122 |
| F01 | 3D world map: province meshes, adjacency graph, click a province for its info panel | M1 | Done | Provinces loaded from a data file. Built as the flat 3D map in the Babylon scene: sea zones underneath, all 1,294 provinces, border lines, hover tooltip, click → province info panel (name, country, region, area, bordering provinces and sea zones), map modes Provinces and Regions, east–west wrap (← / → keys scroll until F03). Implementation notes: section 14 "What F01 built". The 2D map data preview page was removed |
| F02 | Countries layer: ownership of provinces, political overlay, country panel | M1 | Done | Section 4. Province ownership is sim state (`GameState.provinceOwner`, saved, sent in the snapshot when it changes); map mode Political (provinces in their owner's color, the default); country borders follow the current owners; country panel (name, color, capital, provinces, total area, neighboring countries) opened from the province panel's country name. Also: the tiny provinces (Vatican City, Gibraltar, British Indian Ocean Territory) are enlarged to a clickable disc by the map import and Rose Atoll is left out (1,294 provinces). After designer feedback: every country has its traditional color (`country-colors.json`), shifted slightly only where a neighbor would look too much alike; region colors chosen the same way (clearly different, neighbors easy to tell apart); provinces per country capped by a budget so small countries aren't cut finer than big ones (Slovenia 12 → 2, North Macedonia 12 → 2, Kosovo 7 → 2, Ireland 8 → its 4 historic provinces), and Spain uses its 17 autonomous communities; basic map controls (mouse wheel zoom, drag, arrow keys) so the tiny countries can be reached; a province picked from a list is brought into view. Implementation notes: section 14 "What F02 built" |
| F70 | Sea zones: ocean layer, adjacency to coastal provinces, sea zone overlay | M1 | Done | Section 4.5. Sea zones can be hovered (tooltip with the name) and clicked: the sea zone panel (name, depth, bordering sea zones, coastal provinces; the names are links) takes the province panel's place; the province panel's sea zone names are links too; a sea zone picked from a list is brought into view. Map mode **Sea zones**: the sea stays blue, coastal sea zones a slightly lighter shade than open sea, sea zone borders brighter and wider; the other map modes show a calm sea in one even blue (designer feedback: per-zone shades looked random). Every sea zone border connects (the import's tracing now keeps the points where neighbors meet). **Coast zones and open sea** (designer decision): every sea zone that touches a real coast is cut into a coast zone (within 200 km of land) and an open-sea zone; islands under 5,000 km² don't count as a coast; 221 sea zones (123 coast, 98 open sea); the sea zone panel shows the type, and the Sea zones map mode shades coast zones and open sea. Picking: land wins over the sea zone shapes under it. Coastal adjacency fixed where sea zones had grown around a coast (Philippine Sea, Japan's Pacific coast, Denmark and the German Bight, southwestern Norway); the map import now also draws `report/sea_zones.png` to check it. Implementation notes: section 14 "What F70 built" |
| F71 | 2025 starting data: real-world economies, militaries, governments, space programs (approximate) | M1 | Done | **First pass done** (M1 build order step 5): population, GDP (nominal US$) and government type for all 172 countries in `data/country_start.json`, made by `npm run import:starting-data` from saved IMF World Economic Outlook (October 2026) and World Bank tables plus hand-written government types (`packages/tools/starting-data/`); the 10 government types of section 8.12 in `data/government_types.json`; the country panel shows government, population, GDP and GDP per person. Later passes add what the systems need as they arrive (militaries in M8, space programs, nuclear status, interest groups, opinion split…). Implementation notes: section 14 "What F71 built" |
| F125 | Realistic terrain from public elevation/land-cover data, chunked with LOD; zoom levels (strategic, operational, close) | M1 | Planned | Sections 12.5, 14; **⚑ Fable: map/rendering architecture** |
| F126 | Buildings shown on the map (procedural placement in provinces); building levels change their size | M2 | Planned | Section 12.5; placeholder shapes first; **⚑ Fable: map/rendering architecture** |
| F127 | Cities that visibly grow and shrink with population and buildings; night lights | M3 | Planned | Section 12.5 |
| F128 | Infrastructure on the map: rail, roads, power lines, substations, ports, airfields, depots; supply trains and convoys | M3 | Planned | Sections 5.5, 12.5 |
| F129 | Units on the map as 3D models from their designs: land, mechs, ships, aircraft, launches; insignia | M8c | Planned | Section 12.5 |
| F130 | Swarm on the map: bug models, visible hives once detected, infestation creep, waves | M7 | Planned | Section 12.5 |
| F131 | World-state visuals: weather, damage and ruins, disruption haze, lasers, pollution and fallout, blackouts, refugee columns and camps, reconstruction | M9 | Planned | Section 12.5 |
| F133 | Asset generator framework: definition + seed → mesh, materials and detail levels; procedural materials; model lookup through data | M1 | Planned | Section 12.6 |
| F134 | Building and city generators (modular kits, levels, city blocks), infrastructure generators (rail, roads, power lines, depots) | M2 | Planned | Section 12.6; simple first, improved over time |
| F135 | Unit generators from designs: mechs, tanks, aircraft, ships, spacecraft, stations; infantry figures | M8c | Planned | Section 12.6; the mech generator comes earlier, with F51 in M8b |
| F136 | Bug and hive generators from body plans; procedural bug animation | M7 | Planned | Section 12.6 |
| F137 | Generated effects (smoke, fire, lasers, disruption haze, weather), icons and portraits | M8c | Planned | Section 12.6 |
| F64 | Regions layer: province groupings, region overlay, region panel; map import script in `tools/` | M1 | Done | Section 4. Built as the map import (`npm run import:map`, `packages/tools/map-config/`): 172 countries, 1,294 provinces (real borders only), 62 real-geography regions, 126 sea zones with adjacency, plus a temporary 2D map data preview page (removed in F01, which replaced it with the 3D map). The region overlay came with F01 (map mode Regions); the region panel comes with F122 |
| F03 | Camera: pan, zoom, rotate; top-down/angled | M1 | Done | The strategy camera in `map-view.ts`: the view glides (zoom, scrolling, turning); mouse wheel and `+`/`-` zoom towards the mouse; dragging moves the map exactly with the mouse; WASD, the arrow keys and the window's edge scroll (Shift + keys: 3× faster **[DEFAULT]**); Q/E and the middle mouse button turn the map (never with the whole world in view, which is always north up); the camera leans back from 22° (whole world) to 45° (closest) **[DEFAULT]**; Home or the **Whole world** button resets the view. Picking and dragging stay exact when turned and tilted. Implementation notes: section 14 "What F03 built" |
| F04 | Time system: day ticks, pause, 5 speeds, date display | M1 | Done | Real time with pause (section 5.1). The sim worker runs the daily tick by itself at the chosen speed; the game starts paused. Speeds 1–5 = 0.5, 1, 2, 5 and 10 days per second, start speed 2 **[DEFAULT, `gameSpeed` in `data/game_config.json`]**. Never runs behind: a slow day starts the next one at once, missed time isn't made up. Date and speed control top-right (pause/play button, date, "Paused"/"Speed N", five speed bars). Keys: **Space** pause/unpause, **1–5** (top row or number pad) choose the speed, **+ / −** on the number pad one speed faster/slower; the main keyboard's +/− still zoom. Choosing a speed doesn't unpause. Game speed is a worker-level control, not in `GameState` and not saved. The Foundation check panel's "Advance one day" button is gone (tests step days through the debug hook). Implementation notes: section 14 "What F04 built" |
| F05 | Country selection screen | M1 | Planned | |
| F06 | Population model: workforce, pop groups, employment, wages, growth, needs, standard of living | M2 | Planned | Section 8.1; **⚑ Fable: economy core** |
| F65 | National markets: goods list, supply/demand prices (weekly), building profitability | M2 | Planned | Section 8.6; **⚑ Fable: economy core** |
| F07 | Buildings with recipes (inputs → outputs), levels, workers, electricity; partial output when inputs are missing | M2 | Planned | Section 8.3; **⚑ Fable: economy core** |
| F85 | Building catalog and production chains (raw → intermediate → final), data-driven recipes | M2 | Planned | Start with food, steel, fuel and consumer goods; add military chains in M3 |
| F86 | Transport capacity per province, transport costs, industrial cluster bonus | M3 | Planned | Section 8.3 |
| F87 | Production chain view (flow diagram), bottleneck highlighting, build suggestions, per-good overlays, alerts | M3 | Planned | Section 8.3 |
| F88 | Production methods (alternative recipes unlocked by research) | M4 | Planned | Section 8.3 |
| F08 | Food production, consumption, reserves, shortages | M2 | Planned | Section 8.5 |
| F09 | Treasury, taxes, budget lines, debt, inflation | M2 | Planned | Section 8.2 |
| F10 | Stability and happiness calculation; strikes and unrest | M2 | Planned | Section 8.9 |
| F11 | Economy UI screens: budget, population, food, industry | M2 | Planned | |
| F12 | Construction system: private construction (corporations build for profit), state construction (cost depends on economic system), government build contracts, building ownership | M3 | Planned | Section 8.3 |
| F13 | Resource stockpiles: steel, oil, rare metals, energy | M3 | Planned | Section 8.6 |
| F14 | Military production chains: ammunition, small arms, vehicles, aircraft, missiles, rations | M3 | Planned | Sections 8.3, 8.7; mech chains and disruptor rounds come with M8b |
| F15 | Manpower, conscription, division recruitment and training | M3 | Planned | |
| F16 | Laws system (economy mode, conscription, rationing, etc.) | M3 | Planned | Section 8.8 |
| F72 | Government types, political capital, parties, elections | M3 | Planned | Section 8.12 |
| F73 | Economic systems: ownership, procurement (contracts vs quotas), state-owned enterprises, reforms | M3 | Planned | Section 8.13 |
| F74 | Power grid: power plants, substations, blackouts, rolling-blackout priorities | M3 | Planned | Section 5.5 |
| F17 | Factory conversion and industry relocation | M3 | Planned | |
| F18 | Arrival countdown and Phase 0 flow | M3 | Planned | |
| F19 | International trade between national markets: agreements, routes, tariffs | M4 | Planned | |
| F89 | Corporation model: money, debt, owned buildings, workforce, stability, public opinion, events | M4 | Planned | Section 8.4.1 |
| F90 | Bankruptcy (bailout, sale, nationalization, liquidation), mergers, new corporations | M4 | Planned | Section 8.4.2 |
| F20 | Business confidence; independent corporations (count scales with economy; invest, lobby, relocate); government influence tools | M4 | Planned | Section 8.4 |
| F21 | Public opinion stances, drift and news events | M5 | Planned | |
| F22 | Influence resource and influence actions | M5 | Planned | |
| F23 | Opinion limits on law levels | M5 | Planned | |
| F24 | Relations and diplomatic actions (alliances, access, aid, embargoes) | M6 | Planned | |
| F25 | AI countries: personalities; run their own economies | M6 | Planned | **⚑ Fable: country AI** |
| F26 | Landfall: landing pods and Hive creation | M7 | Planned | |
| F27 | Hive growth, Biomass, tiers | M7 | Planned | |
| F28 | Underground infestation spread and emergence | M7 | Planned | |
| F29 | Detection: sensors, recon, shared intel | M7 | Planned | |
| F30 | Divisions: movement, upkeep, military access | M8a | Planned | |
| F75 | Supply chain: supply types, national stockpile → rail/road/port throughput → depots → units; restocking; encirclement | M8a | Planned | Section 5.5; **⚑ Fable: supply chain** |
| F76 | Critical infrastructure damage, repair, and its effects on supply | M8a | Planned | Section 5.5 |
| F77 | HOI4-style combat stats, combat width, reserves; Total War-style morale, routing, flanking, fatigue | M8a | Planned | Section 5.6; **⚑ Fable: combat model** |
| F78 | Armies, commanders, front lines, battle plans, fallback lines | M8a | Planned | Section 5.7; **⚑ Fable: front-line AI** |
| F79 | Animated 3D units on the world map | M8a | Planned | Section 5.7 |
| F80 | Battle view: zoom into a battle and watch it play out, watch-only (instancing, LOD) | M8c | Planned | Section 5.7 |
| F91 | Attack/Defense Planner: behavior, tactics, priorities, support commitment, reserves, saved plan templates; Swarm tactics | M8a | Planned | Section 5.7 |
| F31 | Auto-resolved combat with the counter matrix; building damage | M8a | Planned | |
| F32 | Swarm AI: attack/expand decisions | M8a | Planned | |
| F116 | Air basing and range (airfields, carriers, stations), air superiority per region, region missions, operation focus | M8b | Planned | Section 5.4.5.1 |
| F44 | Unit domains (land/sea/air/space); naval movement through sea zones, ports | M8b | Planned | Section 5.4 |
| F45 | Laser coverage: one shared interception rule for all airborne weapons and units (conventional and nuclear), saturation limit, terrain line of sight | M8b | Planned | Section 5.4.1; implement as a single function every system calls |
| F46 | Heavy-metal disruption: disruptor rounds, cloud value, decay | M8b | Planned | Section 5.4.2 |
| F47 | Mech Walkers: generations, pilots, low-jump rules | M8b | Planned | Section 5.4.3 |
| F92 | Unit identities: names, renaming, insignia, service records, veterancy ranks, earned traits | M8c | Planned | Section 5.3 |
| F93 | Named characters: mech pilots and aces (levels, abilities, wounds, death, retirement), commanders | M8c | Planned | Section 5.3 |
| F94 | Memorial screen; named units and characters in news and events | M8c | Planned | Section 5.3 |
| F48 | Naval bombardment, amphibious landings, mech carriers | M8b | Planned | Section 5.4.4 |
| F49 | Space program: orbit view, launch capacity, satellites, stations, orbital bombardment, orbital drops, object interception | M8b | Planned | Section 5.4.6 |
| F81 | Missile/launch arcs and interception visuals on the map; anti-satellite weapons, debris, escalation ladder | M8b | Planned | Section 5.4.6 |
| F50 | Joint Operation planner with phases; allied contributions | M8b | Planned | Section 5.4.7 |
| F51 | Mech Designer: frames, module slots, stats, saved designs, refits | M8b | Planned | Section 5.4.9 |
| F52 | Division templates mixing mech and conventional battalions | M8a | Planned | Section 5.4.3 |
| F53 | Heavy-metal pollution: build-up, spread, effects, cleanup | M8b | Planned | Section 5.4.2 |
| F54 | Weather and seasons: per-region weather, forecasts, effects on lasers, disruption, movement, food | M3 | Planned | Section 5.4.8; food seasons are needed early |
| F33 | Refugee flow, border policies, camps, integration | M9 | Planned | |
| F34 | Refugee agreements, stability effects | M9 | Planned | |
| F35 | Nuclear strikes, fallout, diplomatic penalties | M9 | Planned | |
| F36 | Research system: global techs (contributions, credit, voting) and country projects; research sharing | M10 | Planned | Section 11.0 |
| F82 | Locked techs and trigger events (mechs after landfall, laser tech after first contact, etc.) | M10 | Planned | Section 11.3; the mech lock must exist as soon as mechs do (M8b) |
| F83 | Private vs state research: corporate research focus, grants and contracts as nudges, state labs with upkeep and direct control, corporate products | M10 | Planned | Section 11.4 |
| F84 | Publish vs keep secret for insights | M10 | Planned | Section 11.0 |
| F37 | Swarm evolution tree and adaptation pressure | M10 | Planned | |
| F38 | Specimen types, decay, cold storage | M10 | Planned | Section 11.1 |
| F55 | Live capture operations and containment (capacity, breach risk) | M10 | Planned | |
| F56 | Xeno Lab experiments, randomized outcomes, insights as tech prerequisites | M10 | Planned | |
| F57 | Bug knowledge levels; hidden stats; evolution warnings | M10 | Planned | |
| F58 | Hive expeditions and capture operations as special operations through the planner | M10 | Planned | Section 5.3, 11.1 |
| F66 | Intelligence agency, networks per country, intel levels hiding/revealing information | M6 | Planned | Section 6.3 |
| F67 | Covert operations, exposure risk, diplomatic incidents, counter-intelligence | M6 | Planned | Section 6.3 |
| F69 | Destabilization via interest groups; coups with outcomes, friendly governments, loyalty drift, exposure | M6 | Planned | Section 6.3 |
| F68 | Espionage hooks into diplomacy (acceptance bonus, leverage, compliance checks), opinion and corporations | M6 | Planned | Section 6.3 |
| F59 | Wars between countries: war goals, declarations, war weariness, peace deals | M8c | Planned | Section 6.2 |
| F60 | Human-vs-human combat: no lasers, air superiority, air defense, human counter matrix | M8c | Planned | Section 6.2, 10.4 |
| F61 | Insurgencies and civil war | M9 | Planned | Section 6.2 |
| F62 | Tech variants (anti-Swarm / anti-human), target profiles, variant choice in designer and templates | M10 | Planned | Section 11.2 |
| F63 | Human-conflict branches: air defense, EW, intelligence/espionage, counter-insurgency, deterrence | M10 | Planned | Section 11.2 |
| F39 | Win/lose conditions; victory and defeat screens | M10 | Planned | |
| F40 | Save / load | M10 | Planned | **⚑ Fable: save system** |
| F41 | United Nations: General Assembly, Security Council, authority, powers, UN Defense Force | M6 | Planned | Section 6.4 |
| F114 | UN reactions: emergency sessions on triggers (nukes, war crimes, abuses, coups), tribunal, infamy | M9 | Planned | Section 6.4 |
| F115 | Corporate takeovers; corporate government types and corporate economic systems | M6 | Planned | Sections 8.12, 8.13 |
| F102 | Pilot pool, pilot academies, training times, specializations | M8b | Planned | Section 8.7 |
| F103 | Tank, aircraft and ship designers | M8c | Planned | Section 5.4.9 |
| F104 | Spaceship and space station designers | M8c | Planned | Section 5.4.9 |
| F105 | Swarm intelligence: scouting parties, knowledge map, escalating waves, target choice, tactic adaptation | M7 | Planned | Section 10.2.1; **⚑ Fable: Swarm AI** |
| F106 | Super Hive (tier 6, random among the first landings, hidden), hive seeding only while it lives, hive destruction rules, phase triggers | M8a | Planned | Sections 3, 10.1 |
| F107 | Reconstruction: clearing, decontamination, rebuilding, voluntary return | M9 | Planned | Section 9.1 |
| F108 | Migration law and peacetime migration, brain drain | M9 | Planned | Section 8.8 |
| F109 | The Moon: global Lunar Program, contributions and access, lunar sites, owned assets for countries and corporations | M10 | Planned | Section 5.4.6 |
| F110 | Endgame politics during Phases 4–5: power competition, troops pulled from fronts, peace options | M11 | Planned | Section 3.4 |
| F111 | Endings: scoring factors, multiple endings, epilogue front pages, world summary | M11 | Planned | Section 3.3 |
| F112 | Game setup options | M11 | Planned | Section 3.0 |
| F113 | Tutorial scenario, advisors, encyclopedia | M11 | Planned | Section 12 |
| F122 | UI shell: top bar, alerts row, outliner, lens bar, notifications and message settings | M1 | Planned | Section 12.1; grows with each milestone |
| F138 | Country screen: a full Paradox-style screen for any country (replaces the simple country panel from F02) | M1 | Planned | Requested by the designer during F02. **Like HOI4** (designer decision): a Government view for your own country and a Diplomacy view for other countries; layout in section 12.4.1. Build after F71 (starting data) and F122 (UI shell) so it has something to show; it grows as systems arrive (government, economy, diplomacy, military) |
| F139 | Performance stress tests (sim and render, ?debug=stress) and engine checkpoint 1: report vs budgets, recommendation, designer decides | M1 | Planned | Section 14; last feature of M1 |
| F140 | Extend stress tests with the real economy and buildings; engine checkpoint 2: report, recommendation, designer decides | M2 | Planned | Section 14; last feature of M2 |
| F123 | Nested tooltips system (every number explains itself) | M2 | Planned | Section 12.3 |
| F124 | Ledger, statistics charts, search, pinning | M5 | Planned | Section 12.3 |
| F95 | Event engine: data-driven events, triggers, options, chains, condition/effect library, AI choices | M2 | Planned | Section 3.1; needed early because many systems fire events |
| F96 | Journal entries (goals, progress, timers, failure conditions) and the campaign phase journal | M3 | Planned | Section 3.1 |
| F97 | Decisions screen and data-driven decisions | M3 | Planned | Section 3.1 |
| F98 | News feed, templates, importance scoring, filters, click-to-jump | M3 | Planned | Section 3.2 |
| F99 | Weekly front pages, monthly war progress reports with charts, press-law spin, foreign press | M8a | Planned | Section 3.2 |
| F100 | Characters: heads of state, ministers (cabinet appointments tied to interest groups), traits, ideology, aging, events | M3 | Planned | Section 4.7 |
| F117 | Ideologies with stances on laws, government types, economic systems and issues (data-driven) | M3 | Planned | Section 8.14 |
| F118 | Pop ideology mixes and what shifts them | M3 | Planned | Section 8.14 |
| F119 | Interest groups: clout, approval, leaders, in government, legitimacy | M3 | Planned | Section 8.14 |
| F120 | Victoria 3-style law enactment (support/oppose, advance/stall/setback, concessions) | M3 | Planned | Section 8.14 |
| F121 | Political movements, radicalism, revolutions; give in / compromise / suppress | M5 | Planned | Section 8.14 |
| F101 | Lead scientists and CEOs | M4 | Planned | Section 4.7; scientists' research bonuses are connected in M10 |
| F42 | ~~Tactical missions~~ | — | Cut | Replaced by unit characterization (5.3) and special operations |
| F43 | ~~Hive assault tactical mission~~ | — | Cut | Replaced by the Hive assault tactic (5.7) |

**Milestones:**
- **M1: Map prototype.** A 3D world with all three layers (regions, countries, provinces), a camera, and time controls. Ends with engine checkpoint 1.
- **M2: A living country.** Population, buildings, food, budget and stability. The country runs on its own. Ends with engine checkpoint 2.
- **M3: Industry and military.** Construction, resources, equipment production, manpower, laws, countdown.
- **M4: Trade and business.** Trade between countries, corporations, business confidence.
- **M5: Public opinion.** Influence and the world's reaction to the object.
- **M6: Diplomacy.** Relations, deals and AI countries running their own economies.
- **M7: The bugs arrive.** Hives land, grow and spread underground. **Lore checkpoint: the designer must write the lore before this milestone starts** (see `CLAUDE.md`).
- **M8: War.** Split into three parts, built in order:
  - **M8a: Ground war core.** Divisions, supply chain, combat model, front lines and battle plans, the Attack/Defense Planner, Swarm attacks, the Super Hive rules.
  - **M8b: Combined arms.** Laser coverage and interception, disruption and pollution, mechs and the Mech Designer, pilots, navy, air basing, space, Joint Operations.
  - **M8c: Designers, characters and visuals.** The other five designers, named units and pilots, the memorial, the battle view, unit models and effects, wars between humans.
- **M9: Human cost.** Refugees, borders and nukes.
- **M10: Arms race and full campaign.** Research, the Moon, winning and losing, saving.
- **M11: Endgame and polish.** Endgame politics, endings, game setup options, the tutorial. **Music and sound checkpoint** (see `CLAUDE.md`).

**Current milestone:** M1

**M1 build order** (each step should leave the project building and runnable):
1. **F132** Core architecture and solution setup (⚑ Fable)
2. **F64** Map import tool (`packages/tools`): provinces, countries, regions and sea zones from public map data into JSON (with the **curated country list** drafted for the designer to approve)
3. **F01** Province map and selection → **F02** countries layer → **F70** sea zones
4. **F03** Camera → **F04** time system (the sim worker's daily tick, driven by game speed)
5. **F71** 2025 starting data (first pass: population, economy size, government type per country)
6. **F122** UI shell (top bar, alerts row, outliner, lens bar, empty screens) → **F138** country screen (design to agree with the designer first) → **F05** country selection
7. **F125** Realistic terrain (⚑ Fable) → **F133** asset generator framework
8. **F139** Performance stress tests and engine checkpoint 1 (section 14, Performance plan and engine checkpoints). Report to the designer and wait for his decision before M2.
