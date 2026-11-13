# Terra Scutum Design: UI layout

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 12. UI, Art & Audio

**The UI takes its inspiration from Hearts of Iron IV (military, map, alerts) and Victoria 3 (economy, politics, lenses, tooltips).** The goal: a huge amount of information, but always one click from the map, and every number explainable.

### 12.1 Layout
- **Top bar (HOI4/Vic3):** the country flag (opens the country panel), then the key numbers: treasury and weekly balance, political capital, Influence, legitimacy, stability, manpower and pilot pool, research, key stockpiles (food, ammo, fuel, steel), global Swarm control %, and the date with speed controls. During Phase 0 it also shows the **arrival countdown**. Every item has a tooltip and opens its screen when clicked.
- **Alerts row (HOI4):** small icons under the top bar for problems and opportunities: units out of supply, a blackout, a shortage, a bankrupt corporation, an angry interest group, an idle factory, a law that can be passed, a UN emergency session. Hover to see details, click to jump, right-click to dismiss. Each alert type can be turned off in settings.
- **Outliner (HOI4, right side):** a collapsible list of armies, fronts, operations, fleets, air wings, construction in progress, research in progress, active journal entries, ongoing espionage operations and pinned provinces. Clicking an entry selects it and moves the camera.
- **Lens bar (Victoria 3, bottom-left):** the main screens grouped into **lenses**, each with its related actions:
  - **Economy:** budget, buildings, **production chains**, markets, trade, corporations
  - **Politics:** government and interest groups, laws, political movements, characters and cabinet, elections
  - **Military:** armies and fronts, the Attack/Defense Planner, production, designers, division templates, the unit roster, the memorial
  - **Diplomacy:** relations, treaties, the UN, intelligence and espionage
  - **Society:** population and pops, ideology, public opinion and influence, refugees, migration
  - **Science:** research (global techs, country projects, corporate R&D), the Xeno Lab
  - **Space:** the orbit view, launches, stations, the Moon
  - **Swarm:** Swarm intel, hive tracker, bug knowledge
- **Bottom-right:** the minimap and map mode buttons.
- **Notifications (Vic3/HOI4):** small toasts for minor events, pop-up windows for important events (which pause the game, if set), and a **message settings** screen where each message type can be set to pop-up, toast, log-only or off.

### 12.2 Map modes
- Map modes, switched with buttons or hotkeys:
  - political (countries), provinces, regions (with hive locations), sea zones
  - control, infestation (where detected), laser coverage, disruption
  - weather, pollution, fallout
  - supply, rail and infrastructure, power grid and blackouts
  - industry, each good (production, consumption, shortage), resources, food
  - population, ideology, interest group support, stability, public opinion
  - refugees, relations, alliances, intel level, UN status
- **Lenses change the map mode automatically** (opening the Economy lens switches to the industry map mode, for example), like Victoria 3.
- **HOI4-style military map:** unit models on the map, front lines drawn as lines, battle plans drawn as arrows, battles shown with an icon and progress bar. Zooming out turns units into counters.

### 12.3 Information tools
- **Nested tooltips (Victoria 3):** every number shows how it's calculated when hovered, and terms inside a tooltip can be hovered for their own tooltip. Example: hovering *Stability 54* shows food +5, unemployment -8, refugees -6, war weariness -4…, and hovering *war weariness* explains that.
- **The ledger (HOI4):** tables and charts comparing countries: economy, military strength, production, research, population, losses, refugees.
- **Statistics screens:** charts over time for the player's country and the world, the same charts the war progress reports use (section 3.2).
- **Search:** find any province, country, character, unit or building by name.
- **Pinning:** pin provinces, characters, corporations or goods to the outliner to keep an eye on them.

### 12.4 Screens
Main menu · Game setup · World map (main screen) · Province panel (population, buildings, construction) · Country screen (section 12.4.1) · Economy & budget · Buildings and construction · **Production chains** (flow view, bottlenecks) · Markets · Trade · Corporations · Population & pops · Laws · Government & interest groups · Political movements · Elections · Military production · **Designers** (mech, tank, aircraft, ship, spaceship, station) · Division templates · Armies & fronts · **Attack/Defense Planner** · Navy · Air · Space program & orbit view · The Moon · Diplomacy · **United Nations** · **Intelligence** · Public opinion / influence · Research (global techs, country projects, corporate R&D) · **Xeno Lab** · Refugees · Swarm intel · **Unit roster and pilots** · **Memorial** · **Journal** · **Decisions** · Event pop-ups · **News** · **Characters** · Ledger & statistics · Encyclopedia · Ending / epilogue · Settings

#### 12.4.1 Country screen (F138) [DEFAULT layout, modeled on Hearts of Iron IV]
Designer decision: the country screen works **like HOI4's**. As in HOI4 there are **two views**:

- **Your own country: the Government view** (HOI4's political screen, opened from the flag at the top-left of the top bar).
  - **Header:** flag (or map color until flags exist), country name, government type, ruling ideology.
  - **Leader:** the head of state's portrait, name, traits and ideology (section 4.7; characters are fictional).
  - **Politics:** political capital and its daily gain, legitimacy, stability; the **interest groups** shown as a pie chart of clout with their approval (where HOI4 shows party popularity), and the next election in democracies.
  - **National modifiers** (HOI4's national spirits): a row of icons for the lasting effects on the country, each with a tooltip.
  - **Laws** (HOI4's conscription, economy and trade laws): the current law in each category, clicking one opens the Laws screen.
  - **Cabinet** (HOI4's advisors): the ministers (section 4.7) with their traits and interest group; empty seats can be filled.
  - **Public opinion:** the four stances (section 7) as a bar.
  - **Buttons** to the screens this one summarizes: Laws, Government & interest groups, Decisions, Ledger.
- **Another country: the Diplomacy view** (HOI4's diplomacy screen, opened by clicking a country on the map or its name in any panel).
  - **Header:** flag, name, government type and ruling ideology, the leader's portrait and name, and the country's AI personality where your intel allows (section 4.3).
  - **Relations:** their opinion of you (-100 to +100) with a breakdown tooltip; alliances, treaties, guarantees, wars and UN status.
  - **Diplomatic actions** (HOI4's action list): improve relations, propose treaties, trade agreements, declare war and so on; each greyed out with the reason when it can't be taken (section 6).
  - **Intelligence:** your intel level on them (section 6.3); hidden values show as "?" when intel is low.
  - **Overview:** capital, provinces, total area, neighbors (the F02 country panel), plus population, economy size and military strength once those exist.
- **Parts that don't exist in the sim yet** show a short "comes with F…" note instead of being left out, so the layout is visible from the start; each fills in as its feature arrives.
- **Still open, to confirm with the designer when F138 is built:** whether the views open as a large panel over the map (as in HOI4) or full-screen; flags (generated by code, real flag designs, or the map color only).

### 12.5 Art Direction: a Living, Realistic Map
**Realistic graphics, with a map that works like HOI4's but shows everything that's really there.** From far away it reads like a HOI4 strategy map. Zooming in reveals a realistic 3D world where the player can see their cities, buildings, infrastructure and forces.

#### Zoom levels
| Zoom | What the player sees |
|---|---|
| **Strategic (far)** | HOI4-style map: realistic terrain with province and country borders, map-mode colors, unit counters, front lines and battle arrows. Cities shown as clusters of lights and buildings |
| **Operational (middle)** | Terrain, rivers, coasts and forests in detail; cities with their districts; major infrastructure (rail lines, highways, ports, airfields, power plants); unit models standing in provinces; ships at sea |
| **Close (near)** | Individual buildings, streets, rail yards, substations and power lines; units and bugs as detailed animated models; smoke, fires, disruption clouds, weather |

#### Everything built is visible
- **Every building is on the map.** Each building the player (or a corporation, or an AI country) builds appears as a 3D model in its province: farms, mines, oil wells, power plants, steel mills, factories, research centers, Xeno Labs, pilot academies, spaceports, refugee camps, military bases, fortifications.
- **Cities grow.** Cities are built from districts (residential, industrial, commercial). As a province's population, buildings and wealth grow, its city visibly **expands**: new districts, taller buildings, more lights at night. When a city shrinks, is damaged or is abandoned, that shows too.
- **Building levels show:** expanding a building to a higher level makes it physically bigger (more chimneys, more factory halls, more silos).

#### Infrastructure is real on the map
- **Rail lines, roads and highways** run between cities along real routes. Upgrading infrastructure adds tracks and lanes. Supply trains and truck convoys move along them (section 5.5).
- **Power grid:** power plants, **substations** and **power lines** are visible. Blacked-out provinces go dark at night (section 5.5).
- **Ports, airfields, rail hubs, supply depots and fuel depots** are visible and show activity (ships docking, aircraft parked, stockpiles filling or emptying).
- **Fortifications and defense lines:** trenches, walls, bunkers, minefields and gun lines appear where they're built.
- **Damage:** destroyed infrastructure shows as broken rail, collapsed pylons and burning depots until repaired.

#### Units are real on the map
- **Land:** infantry, tanks, artillery and **mechs** as 3D models in their provinces, using the player's **designs** (section 5.4.9): a mech built with a heavy cannon and a shield looks like it.
- **Sea:** ships as 3D models in sea zones and ports, using the ship designs.
- **Air:** aircraft parked at airfields and carriers, flying when on missions.
- **Space:** launches lift off from spaceports with visible trails; satellites, stations and spacecraft are shown in the orbit view (section 5.4.6).
- **The Swarm:** bugs as animated 3D models (every bug type, section 10.5); **hives** show as surface structures once detected; **infestation** shows as creeping alien growth on the ground; scouting parties and waves move visibly.
- **Characterization:** unit insignia and colors (section 5.3) show on the models.

#### The world shows its state
- Weather (rain, snow, fog, dust storms, seasons), day and night with city lights.
- **The war:** craters, ruins and fires in contested provinces; the heavy-metal **disruption cloud** as a visible haze; laser beams; **pollution** and **fallout** as stained, dead land.
- **Refugees:** columns of people and vehicles on the roads; camps that grow.
- **Reconstruction:** rubble cleared and buildings rising again (section 9.1).

#### Realism, scope and placeholders
- **Style:** realistic, grounded military and industrial look; muted Earth colors; the Swarm as organic and alien (an organic red-purple palette **[DEFAULT]**).
- **Real-world terrain:** the map's height and terrain come from public elevation and land-cover data, so mountains, rivers and coasts are real.
- **Generated assets, not hand-made ones:** the designer has no 3D assets, so all models are **generated by code** (section 12.6). They start simple and get more detailed over time. The game must be fully playable at every stage.
**Tutorial and onboarding:**
- A **guided tutorial scenario** (a small, scripted start in one country) that teaches the systems in order: the map, time, economy and buildings, production chains, politics, diplomacy, then a short Swarm landing, supply, the Attack/Defense Planner and research.
- **Advisors [DEFAULT]:** the cabinet ministers (section 4.7) act as advisors, pointing out problems ("Our ammunition stockpile will run out in 12 days").
- **Tooltips everywhere** that explain how a number is calculated (nested tooltips, like Victoria 3).
- An in-game **encyclopedia** of systems, units, bugs and techs.
- **Journal entries** (section 3.1) act as a natural guide to what matters right now.

**Placeholder art policy:** the first version of every generated asset can be very simple (a few boxes with the right proportions and colors). Generated buildings still go in their real positions, so the map already shows cities growing.

### 12.6 Asset Pipeline: Generated 3D Assets
**There are no hand-made 3D assets. Every model, texture and material is generated by code**, from the same data the game already uses. This fits the game well: buildings have levels, units come from player designs, and bugs come from a defined roster, so all of them can be built from parameters.

#### What gets generated, and how
| Asset | How it's generated |
|---|---|
| **Terrain** | From real elevation and land-cover data (section 14), with generated materials for each land type (grass, forest, desert, snow, farmland, urban ground) |
| **Buildings** | From **modular kits**: a building type is defined in data as a set of parts (halls, chimneys, silos, cooling towers, tanks, pipes, roofs, fences) with sizes and colors. Higher building levels add more parts. Each building looks distinct but consistent, and a random seed per building adds variety |
| **Cities** | Assembled from generated blocks: street grids, residential, commercial and industrial blocks, towers in the city center, scaled by population and wealth |
| **Infrastructure** | Rail, roads and power lines generated along splines; pylons, substations, depots, ports and airfields built from kits |
| **Mechs, tanks, aircraft, ships, spacecraft, stations** | Generated **from the player's designs** (section 5.4.9): each **base** (frame, chassis, hull, airframe, core module) is a generated body, and **each module adds a visible generated part** (a cannon, a shield, missile pods, armor plates, turrets, radar, engines). A design looks like what it is |
| **Infantry and crowds** | Simple generated figures, drawn in large numbers with instancing; refugee columns use the same figures with vehicles |
| **Bugs** | Generated from **segmented body plans** in data: body segments, legs, mandibles, carapace plates, organs (the Interceptor's glowing laser organ, the Spitter's acid sacs, the Breacher's armored head). Each bug type has its own plan; variety comes from seeds |
| **Hives and Swarm growth** | Generated organic shapes (mounds, spires, tunnels, creeping growth on the ground) |
| **Effects** | Generated particle effects: smoke, fire, explosions, laser beams, the disruption haze, weather |
| **Materials and textures** | Procedural materials (noise-based concrete, metal, rust, camouflage, painted insignia, organic chitin), so nothing needs texture files |
| **Icons and portraits** | Unit icons, building icons and simple character portraits generated from the same data **[DEFAULT]** |

#### How it's built
- **Generators live in code** (TypeScript, `packages/game/src/generators`): a generator takes a definition from the data files plus a seed and produces a mesh and materials.
- **Generated at load time or build time [DEFAULT]:** generators run in the browser when a model is first needed and are cached; expensive ones can be pre-generated by a tool in `packages/tools` and saved as `.glb` files. Player designs are generated **at runtime** when a design is saved.
- **Level of detail is generated too:** every generator produces several detail levels (icon, simple, detailed) for the zoom system (section 12.5).
- **Animation:** walking, jumping (mechs), firing and bug movement are **procedural animations** (legs and joints driven by code), not hand-animated clips.
- **Quality improves over time:** generators start simple (boxes and cylinders in the right shapes) and get more detailed in later milestones, without changing the rest of the game.

#### Replacing assets later
- Every model is looked up through data (building type → model, unit design → model, bug type → model). Any generated asset can later be **replaced by a real model** (made by hand, bought, or made with an AI text-to-3D tool) by changing one data entry. Nothing in the game code depends on where a model came from.
- **Optional free resources [DEFAULT: not used unless the designer approves]:** public-domain (CC0) textures and environment lighting can improve realism without adding hand-made models.
**Audio:** **music and sound will be designed later** (the designer will decide when the game reaches that point; see the reminders in `CLAUDE.md`). Placeholder idea: tense ambient strategy music that grows more intense with Swarm control; alert stings for landings, emergences, nukes and province losses.
