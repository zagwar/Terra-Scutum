# Game Design Document — Terra Scutum: The Last Line of Earth — INDEX

> **For Claude Code:** this file is the **index** of the design doc. The full design
> lives in `docs/`, one file per system. **Read this file first, then only the docs
> files your task needs** (see "Which files to read" below). The design is the source
> of truth: build only what it describes or what the current prompt asks for, and ask
> when something is unclear or missing.
>
> - **[DEFAULT]** marks a placeholder decision the designer may change; keep those values in data, not hard-coded.
> - **[REVISIT]** marks something agreed for now that will be redesigned later.
> - When a feature is finished, update its status in `docs/12_feature_tracker.md`.
> - Add any design decision you make to `docs/14_decision_log.md`.
> - Systems listed as not designed in `docs/15_open_questions_and_gaps.md` get simple placeholders marked [DEFAULT]; don't invent full designs for them.
> - **Section numbers are the same in every file**, so "section 8.3" always means the same thing. Use the table below to find which file holds a section.

**Title:** *Terra Scutum: The Last Line of Earth* (short form: *Terra Scutum*)
**Last updated:** 2026-11-16
**Platform:** runs in the **web browser** (desktop app wrapper for Steam later) · **Language:** TypeScript · **3D:** Babylon.js · **UI:** React · **Simulation:** a separate pure TypeScript package (see `docs/13_technical.md`)
**Development:** Claude Code cloud sessions (browser) on the GitHub repo `terra-scutum`; previews on Cloudflare Pages
**Target platform:** Windows / Mac / Linux **[DEFAULT]**
**Current milestone:** M2 (see `docs/12_feature_tracker.md`)

---

## The game in one paragraph
In January 2025 an unknown object is detected heading for Earth. The player leads one real-world country through two years of public confusion, politics and preparation before an intelligent alien bug swarm lands (around January 2027), digs underground hives, and starts spreading. Laser-armed bugs take the sky away, so humanity has to fight with combined arms: heavy-metal disruption to blind the lasers, conventional armies holding the line, and player-designed mechs (only developed after landfall) as the elite spearhead. Meanwhile the player runs a Victoria 3-style economy and politics (pops, ideologies, interest groups, Factorio-style production chains, independent corporations), deals with refugees, diplomacy, espionage, coups and the UN, studies captured bugs XCOM-style, and eventually finds and destroys the hidden Super Hive and then every remaining hive, while the world's countries start competing for the post-bug world. It's a 3D, top-down grand strategy game that runs in the web browser (TypeScript, Babylon.js and React), inspired by Terra Invicta, Hearts of Iron IV, Victoria 3, XCOM, Muv-Luv, Factorio and Helldivers (for feel only).

## Design pillars
1. **Time is the real enemy.** The prep phase is a countdown, and the early invasion feels inevitable.
2. **What you can't see is growing.** Hives expand underground; intel and detection decide whether you're surprised.
3. **An army is only as strong as the country behind it.** Running the economy, food, industry, population and politics is half the game.
4. **Humanity is not united.** Countries have their own interests; cooperation is as hard as fighting the bugs.
5. **Every lost province has a human cost.** Refugees, poisoned land and broken production chains.
6. **Knowledge turns the tide.** Humans win by studying the bugs and building counters.
7. **The sky belongs to the bugs.** Blind the lasers, then strike.
8. **Both sides adapt.** The Swarm learns and evolves; so must the player.

## Where everything is
| File | Sections | What's in it |
|---|---|---|
| `GETTING_STARTED.md` | — | The designer's beginner guide: GitHub and Cloudflare setup, Claude Code in the browser, testing on preview links, merging features |
| `docs/01_concept_and_campaign.md` | 1–3 | Concept, pillars, campaign phases, win/lose, game setup, events/journal/decisions, news, endings, endgame politics |
| `docs/02_world_and_characters.md` | 4 | Regions, countries, provinces, sea zones, their data fields, hives and regions, characters |
| `docs/03_military.md` | 5 | Game layers, unit characterization (named units, pilots, aces), combined arms, laser coverage, disruption and pollution, land/sea/air/space, air basing, the Moon, joint operations, weather, the six designers, supply and logistics, combat model, army control, Attack/Defense Planner, battle view |
| `docs/04_diplomacy_espionage_un.md` | 6 | Diplomacy, nuclear weapons, human wars, espionage, destabilization and coups, the United Nations |
| `docs/05_public_opinion.md` | 7 | Public opinion stances (Denial, Prepare, Contact, Panic) and influence |
| `docs/06_economy.md` | 8.1–8.11 | Pops, budget, buildings and production chains, private/state construction, corporations and bankruptcy, food, goods and markets, trade, military production, pilots, laws, stability, unit roster |
| `docs/07_politics.md` | 8.12–8.14 | Government types, corporate governments, economic systems, ideologies, interest groups, law enactment, political movements |
| `docs/08_refugees_and_reconstruction.md` | 9 | Refugees, border policies, reconstruction and voluntary return |
| `docs/09_swarm.md` | 10 | Hives, the Super Hive, tunnels and spread, Swarm intelligence, evolution, counter matrix |
| `docs/10_research.md` | 11 | Global techs and country projects, xenobiology (specimens, experiments, insights), tech variants, locked tech, private vs state research |
| `docs/11_ui_art_audio.md` | 12 | UI layout (HOI4/Vic3), map modes, tooltips, screens, art, audio, tutorial |
| `docs/12_feature_tracker.md` | 13 | Every feature with its milestone and status; the milestone list |
| `docs/13_technical.md` | 14 | Web stack (TypeScript, Babylon.js, React), repository structure, how the sim and game talk, map data, battle view rendering, architecture rules, daily tick order, testing, scope, saves |
| `docs/14_decision_log.md` | 15 | Every design decision and why |
| `docs/15_open_questions_and_gaps.md` | 16–17 | Open questions, content still to write, technical prep |

## Which files to read for a task
- **Always:** this index, `docs/12_feature_tracker.md` (find the feature you're building), and `docs/13_technical.md` (code rules).
- **Then the system's file(s).** Examples:
  - Map, provinces, data import → `02_world_and_characters.md`
  - Economy, buildings, production chains, corporations → `06_economy.md` (plus `07_politics.md` if laws or economic systems are involved)
  - Politics, laws, elections, ideologies → `07_politics.md`
  - Combat, units, supply, designers → `03_military.md` (plus `09_swarm.md` for anything the bugs do)
  - Bugs, hives, spread → `09_swarm.md` (plus `03_military.md` for lasers and combat)
  - Diplomacy, espionage, UN, nukes → `04_diplomacy_espionage_un.md`
  - Research → `10_research.md`
  - Events, journal, decisions, news, endings → `01_concept_and_campaign.md`
  - UI work → `11_ui_art_audio.md` plus the file for the system the screen shows
- **Cross-references:** when a file says "see section X," check the table above and read that section only if the task needs it.

## Glossary (use these exact terms in code and docs)
| Term | Meaning |
|---|---|
| **Region** | One of ~50 large geographic areas; holds at most one hive; shares weather |
| **Country** | A real-world nation (curated list); owns provinces |
| **Province** | The smallest land unit (~1,000); buildings, pops, combat, infestation |
| **Sea zone** | An ocean area for naval movement, trade and Swarm seabed crossing |
| **Hive** / **hive tier** | A Swarm base in a region; tiers 1–5 |
| **Super Hive** | The single tier-6 hive (random among the first landings); the only source of new hives |
| **Infestation** | Hidden underground Swarm presence in a province (0–100) |
| **Emergence** | Bugs coming to the surface when infestation reaches 50 |
| **Laser coverage** | A province's chance of shooting down anything airborne (0–100) |
| **Disruption** | The heavy-metal cloud that weakens laser coverage (0–100, decays fast) |
| **Pollution** / **fallout** | Long-lasting land contamination from heavy metals / nukes |
| **Pop** | A population group in a province (laborers, skilled workers, professionals, owners, officials, soldiers) |
| **Workforce** / **dependents** | The people of a province who work or look for work (split into pops) / everyone else: children, the elderly and others who don't work |
| **Needs** / **standard of living** | What pops buy, in three tiers (basic, everyday, luxury) / how many of its needs a pop can afford, 0–100 |
| **Building** / **level** / **recipe** | A production site in a province, one per building type / how big it is (more levels: more workers, inputs and output) / what one level uses and makes in a day: workers by pop group, electricity, inputs → outputs |
| **Output** (of a building) / **held back** | How much of its full output a building makes today, 0–100 % / running below that for lack of workers, electricity or an input |
| **National stockpile** | A country's store of goods: what its buildings make goes in, what they use comes out (a stand-in until markets) |
| **Ideology** | A political belief with stances on laws, government types and economic systems |
| **Interest group** | A political group (Armed Forces, Corporate Lobby…) with clout, approval and a leader |
| **Clout** / **legitimacy** / **political capital** | An interest group's power / how accepted the government is / the resource spent on laws and reforms |
| **Political movement** | Pops organizing for a change; can radicalize |
| **Event** / **journal entry** / **decision** | A choice that happens to you / an ongoing situation with goals / an action you start |
| **Global tech** / **country project** | Shared research everyone contributes to / a country's own research |
| **Specimen** / **experiment** / **insight** / **knowledge level** | Bug material / a study in a Xeno Lab / a discovery that unlocks techs / how well a bug type is understood (0–5) |
| **Front line** / **battle plan** / **Joint Operation** | Where an army defends / an offensive arrow / a multi-domain, multi-phase attack |
| **Attack/Defense Planner** | Where behavior, tactics, priorities and support for a plan are set |
| **Supply depot** / **throughput** / **blackout** | Front-line supply storage / how much a rail, road or port link carries per day / a province without power |
| **Private / state construction (or research)** | Done by corporations for free but uncontrolled / done by the government, controlled but paid for |
| **Contract** / **grant** | Paying a corporation to build or research something specific / to nudge its research direction |
| **Infamy** / **UN authority** | A country's record of war crimes and abuses / how much the UN is respected |
| **Object Alpha** | The object detected heading for Earth in Phase 0 |
| **The Swarm** / **Hostile Biological Organism (H-B-O)** | The common name for the bugs / their official designation |
| **Preview link** | The Cloudflare Pages link where each pull request's version of the game can be played |
| **Sim worker** | The Web Worker that runs the simulation in the browser |
| **Phase** | Campaign stage: 0 Detection, 1 Landfall, 2 The Spread, 3 Counteroffensive, 4 The Hunt for the Super Hive, 5 Extermination |
