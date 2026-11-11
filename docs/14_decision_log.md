# Terra Scutum Design: Decision log

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 15. Decision Log

| Date | Decision | Why |
|---|---|---|
| 2026-11-11 | The game is 3D with a top-down/angled camera, like HOI4 or Terra Invicta | Designer decision |
| 2026-11-11 | Real countries with diplomacy, not a unified Earth; the player controls one country | Politics and cooperation are a core challenge |
| 2026-11-11 | Factorio-style production chains: many buildings with recipes, raw → intermediate → final goods; location and transport matter | Designer decision |
| 2026-11-11 | Mech development can only start after landfall; Swarm-specific tech unlocks through trigger events | Designer decision; the early war is fought conventionally |
| 2026-11-11 | Research is split into global techs (everyone contributes, top contributors get credit) and country projects, like Terra Invicta | Designer decision |
| 2026-11-11 | The battle view is watch-only; battles are controlled through an Attack/Defense Planner (behavior, tactics, priorities, support) | Designer decision |
| 2026-11-11 | Corporations are fully simulated: money, debt, owned buildings, workforce, stability, public opinion; they can go bankrupt, with bailout/sale/nationalization/liquidation choices | Designer decision |
| 2026-11-11 | Construction mirrors research: private construction is free but uncontrolled (steered with contracts); state construction is possible everywhere but costs more in market economies (public-private partnerships in free markets) | Designer decision |
| 2026-11-11 | Private research is free but uncontrolled (steered with grants and contracts); state research is controlled but paid for with upkeep; neither is inherently slower | Designer decision; gives countries a reason to keep corporations |
| 2026-11-11 | Game starts January 2025, with real-world 2025 starting data; arrival about January 2027 | Designer decision |
| 2026-11-11 | Sea zones are a separate map layer for naval movement, trade and Swarm seabed crossing | Designer decision |
| 2026-11-11 | Government types with different political hurdles; political capital, parties, elections | Designer decision |
| 2026-11-11 | Economic systems (free market, mixed, state capitalism, command) decide ownership, procurement and corporate lobbying | Designer decision |
| 2026-11-11 | Detailed supply chain (ammo, fuel, rations, parts, electricity; rail, ports, depots) and critical infrastructure with blackouts | Designer decision; supply is a core system |
| 2026-11-11 | Combat: HOI4-style math with Total War-style morale, routing, flanking and fatigue | Designer decision |
| 2026-11-11 | Army control like HOI4 (front lines, battle plans); battles can be watched in a Total War-style 3D battle view | Designer decision |
| 2026-11-11 | Space blends Terra Invicta's orbital buildup with ICBM-style launch arcs, interception and escalation | Designer decision |
| 2026-11-11 | Players and AI can destabilize countries and stage coups to install friendly governments; friendly governments aren't puppets | Designer decision |
| 2026-11-11 | Espionage is an everyday tool that works with diplomacy and public opinion: networks, intel levels, covert operations, exposure risk | Designer decision |
| 2026-11-11 | Curated country list (tiny countries merged into a neighbor); every included country is playable for now | Designer decision; revisit a curated playable list later |
| 2026-11-11 | Flat 3D map (HOI4-style), not a globe | Designer decision |
| 2026-11-11 | No Swarm reinforcements from space after the first landings | Designer decision |
| 2026-11-11 | Pro-Swarm opinion is mainly a pre-arrival force that slows the buildup; after landfall only rare cults remain | Designer decision |
| 2026-11-11 | Economy depth: Victoria-style pops and markets, simplified (no cultures or religions; about 30 goods) | Designer decision |
| 2026-11-11 | Wars between humans are rare and a last resort; no full annexation during the invasion | Designer decision |
| 2026-11-11 | Corporations are independent actors; their number scales with the economy; the government influences them but doesn't control them | Designer decision |
| 2026-11-11 | Three map layers: Regions (about 50, geography, hives, weather), Countries (politics), Provinces (about 1,000, buildings, resources, combat). Small countries can be one province | Designer decision; hives work at a big scale while the economy and war get detail |
| 2026-11-11 | Nukes are allowed but carry fallout and heavy diplomatic penalties | Creates a meaningful moral and political tradeoff |
| 2026-11-11 | Xenobiology is gated by specimens: corpses, live captures and hive samples go through experiments to give insights (XCOM / Terra Invicta style) | Designer decision; ties research to the war |
| 2026-11-11 | Wars between humans, insurgencies and civil wars exist alongside the Swarm war | Designer decision; humanity isn't united |
| 2026-11-11 | Tech variants: many techs split into anti-Swarm and anti-human versions with target profiles | Designer decision; forces a choice about which war to prepare for |
| 2026-11-11 | HOI4-style Mech Designer: frames and modules unlocked through research | Designer decision |
| 2026-11-11 | Mechs are expensive elites; conventional forces remain the backbone; divisions mix both | Designer decision |
| 2026-11-11 | Weather and seasons are in: they affect lasers, disruption, movement and food | Designer decision; adds timing to operations |
| 2026-11-11 | Heavy-metal disruption pollutes the land, spreads, and causes diplomatic friction | Designer decision; disruption has a long-term cost |
| 2026-11-11 | Lasers intercept nuclear missiles and bombers; intercepted warheads don't detonate | A military reason, as well as a political one, why nukes don't solve the war |
| 2026-11-11 | The 24-month prep phase centers on public opinion and influence | The world doesn't know how to react; the player shapes the response |
| 2026-11-11 | UI inspired by HOI4 (top bar, alerts, outliner, military map, ledger) and Victoria 3 (lenses, nested tooltips, map modes tied to lenses) | Designer decision |
| 2026-11-11 | Politics work like Victoria 3: ideologies, pop ideology mixes, interest groups with leaders and clout, legitimacy, law enactment, political movements. Every character has an ideology | Designer decision |
| 2026-11-11 | Air zones: bases with range, air superiority per region, wings focus on operation provinces when assigned to an operation | Designer decision |
| 2026-11-11 | Pilots are a separate manpower pool trained at pilot academies | Designer decision |
| 2026-11-11 | Six designers: mech, tank, aircraft, ship, spaceship, space station | Designer decision |
| 2026-11-11 | The Swarm learns: scouting parties first, then escalating waves toward biomass centers it has discovered | Designer decision |
| 2026-11-11 | Retaken provinces must be cleared, decontaminated, rebuilt and repopulated; refugees are never forced home | Designer decision |
| 2026-11-11 | The Super Hive is a random one of the first landings (hidden). It's the only source of new hives. Killing it doesn't kill other hives; every hive must be destroyed to win | Designer decision |
| 2026-11-11 | Endgame politics happen during the hunt for the Super Hive and extermination (not a separate post-war phase); war isn't guaranteed and world peace is possible | Designer decision |
| 2026-11-11 | The UN reacts automatically to nukes, war crimes and abuses of power, with a wide set of powers (tribunal, embargoes, suspension, intervention, recognition) | Designer decision |
| 2026-11-11 | The Moon is a global project; every country and corporation can contribute and owns what it builds there | Designer decision |
| 2026-11-11 | Corporations can take over governments; several corporate government types and corporate economic systems | Designer decision |
| 2026-11-11 | The UN exists and has real powers, scaling with its authority | Designer decision |
| 2026-11-11 | Phase 3 starts when the first tier-5 hive is destroyed | Designer decision |
| 2026-11-11 | Peacetime migration is controlled by a migration law | Designer decision |
| 2026-11-11 | The Moon is in scope as an expensive megaproject | Designer decision |
| 2026-11-11 | Full game setup options; a tutorial; multiple endings decided by the world state | Designer decision |
| 2026-11-11 | No multiplayer, modding or extra languages for now; keep the door open (data files, `tr()`, deterministic sim) | Designer decision |
| 2026-11-11 | Named characters: heads of state, ministers, lead scientists, CEOs (all fictional) | Designer decision |
| 2026-11-11 | Victoria 3-style events, journal entries and decisions, all data-driven | Designer decision |
| 2026-11-11 | News system: feed, front pages, war progress reports, press-law spin | Designer decision |
| 2026-11-11 | XCOM-style squad missions are cut; XCOM-style unit characterization is kept (named units, service records, veterancy, earned traits, named pilots and aces, a memorial) | Designer decision; keeps the attachment without a separate game mode |
| 2026-11-11 | Running the country (economy, industry, business, population, food, military, manpower) is a core pillar and gets its own milestones right after the map | Designer decision; every other system depends on it |
| 2026-11-11 | Combined arms (land/sea/air/space) modeled on Muv-Luv's doctrine: laser bugs deny the sky, heavy-metal disruption blinds them, mechs are the main battle unit | Designer decision; makes every domain matter and gives the war its identity |
| 2026-11-11 | The Swarm has no flying units; Laser Bugs appear early (about 2 weeks after landfall) | Matches the doctrine; the early loss of air power is a key story beat |
| 2026-11-11 | All countries, including AI ones, run the same economic model | Keeps things fair, and lets the Swarm's damage cascade realistically |
| 2026-11-11 | Simulation kept separate from UI | Lets Claude Code test and balance the campaign headless |
| 2026-11-11 | Naming: the Swarm (common), an HBE-style official designation, a scientific name for every bug type; military codenames (role hints) before identification and in classified files; role names after identification | Designer decision |
| 2026-11-11 | The object is "Object Alpha"; the official designation is "Hostile Biological Organism"; "the Swarm" is the common name | Designer decision |
| 2026-11-11 | The game is titled **Terra Scutum** ("Earth Shield"), replacing the working title HIVEFALL | Designer decision |
| 2026-11-11 | Full title: *Terra Scutum: The Last Line of Earth* (short form *Terra Scutum*) | Designer decision |
| 2026-11-11 | Bug role names confirmed: Scout, Swarmer, Burrower, Interceptor, Heavy Interceptor, Spitter, Breacher, Siege Beast, Guardian, Harvester, Hive, Super Hive | Designer decision |
| 2026-11-11 | Art direction: realistic graphics; HOI4-style strategic map, but every building, city, piece of infrastructure, unit, ship, aircraft, spacecraft, mech and bug is visible on the map; cities visibly grow | Designer decision |
| 2026-11-11 | Lore and music are deferred; Claude Code reminds the designer (lore before M7, music at M11) | Designer decision |
| 2026-11-11 | Claude Fable 5.2 (limited access) is reserved for the hardest work, marked ⚑ Fable in the feature tracker; Claude Code reminds the designer to switch | Designer decision |
| 2026-11-11 | C# instead of GDScript; the simulation is a separate pure C# library tested with xUnit and run headless by a console campaign runner | The daily tick is heavy (≈1,000 provinces, pops, markets, every country, AI); C# is much faster for this, and a Godot-free sim is faster to test, deterministic, and easier for Claude Code to work on |
| 2026-11-11 | All 3D assets are generated by code (terrain, buildings, cities, infrastructure, units from player designs, bugs from body plans, effects, materials); replaceable later through data | The designer has no 3D assets; generation fits the data-driven design |
| 2026-11-11 | Development runs in Claude Code cloud sessions (browser) on a GitHub repository; one feature per session, merged by pull request; the designer plays locally with Godot .NET and GitHub Desktop | Designer decision: no local Claude Code install |
| 2026-11-11 | **Switched to a web stack: TypeScript, Babylon.js (3D), React (UI), Vite, npm workspaces, Vitest, Playwright; hosting and preview links on Cloudflare Pages. Replaces Godot + C#.** | Development is entirely in Claude Code cloud sessions: Node is pre-installed, Claude Code can run and screenshot the game in headless Chromium, and the designer plays every version in his browser with nothing installed |
