# Terra Scutum Design: Hives

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 10. The Swarm (alien bugs)

### 10.1 Hives
- Each landing pod becomes a **Hive** with a hidden **underground** core.
- Hive tiers 1–5. A hive grows by gathering **Biomass**, which it takes from provinces it controls, more from populated ones.
- **The Super Hive (tier 6):** one of the **first landing pods**, chosen **at random**, becomes the **Super Hive**, one tier above every other hive. The player **doesn't know which one** at the start: all landing sites look the same at first, and the Super Hive has to be identified through intel, recon and xenobiology insights over the course of the war.
  - It's the **heart of the Swarm**: it's the only source of **new hives** (seeding, section 4.6) and drives Swarm evolution. It has the strongest defenses (Guardians, the deepest core).
  - **Destroying it doesn't kill the other hives.** It stops the Swarm from **making new hives** and from evolving new bug types **[DEFAULT]**, which starts Phase 5. Every other hive keeps fighting and **has to be destroyed** to exterminate the bugs.
- **Seeding is the Super Hive's job:** while the Super Hive lives, new hives keep appearing (seeded from the Super Hive's network through tier 3+ hives). Killing ordinary hives while the Super Hive lives slows the Swarm, but can't end it.
- **Destroying hives:** tier 1–2 cores can be destroyed by conventional assault (or, in the early window, nukes). Tier 3+ cores are too deep without the **Hive Breaker** tech. Destroying the **first tier-5 hive** starts Phase 3.
- Higher tiers give: more unit production, a bigger tunnel range, new structures and evolution options. Higher tiers also put the core **deeper**, so it's harder to nuke or assault.
- At tier 3 or higher, a Hive can **seed a new Hive** in an adjacent region that has no hive yet (section 4.6).

### 10.2 Spread and tunnels
- The Swarm spreads **underground first**. Infestation in a neighboring province rises before any bugs appear on the surface.
- When infestation reaches 50, bugs **emerge**, and the province becomes Contested, even if it's behind a front line.
- Only seismic sensors, air recon or shared intel from allies reveal infestation. Otherwise the player sees just a vague "seismic activity" warning.
- Spread is slow early and speeds up as hive tier rises.
- **The Swarm ignores borders.** Tunnels cross between countries, so one nation's weak defense endangers its neighbors.

### 10.2.1 Swarm Intelligence: the bugs learn
**The Swarm is intelligent and learns over time.** It starts cautious and blind, and gets smarter and bolder as it learns about Earth.
- **Early (Landfall):** the Swarm only sends **scouting parties**: small groups that probe nearby provinces, test defenses, and retreat. Most of its effort goes into growing the hive.
- **Learning:** each scouting party that survives (or dies somewhere) teaches the Swarm about that province. It builds a hidden **knowledge map** of Earth: where **biomass centers** are (cities, populated provinces, farmland), where defenses are strong or weak, and where its tunnels can reach.
- **Escalation:** as the Swarm learns where biomass is, and as its hives grow, it sends **bigger and bigger waves** at the most valuable targets it has found. Waves grow from scouting parties, to raids, to assault waves, to full offensives.
- **Target choice [DEFAULT]:** the Swarm weighs biomass value (population and farmland), distance from its hives, known defenses, and how much it knows about the province. It avoids places where it lost heavily, unless the prize is big.
- **Adapting:** besides evolving new bug types (10.3), the Swarm changes its **tactics** (section 5.7) to whatever has worked against the player: tunnel ambushes if fronts are strong, laser screens if air power is heavy.
- **Counterplay:**
  - **Kill scouting parties quickly** and the Swarm learns less.
  - **Deception [DEFAULT]:** decoy defenses and hidden fortifications feed it wrong information.
  - **Evacuating** a biomass center makes it less attractive.
  - Studying the Swarm (section 11.1) shows what it knows about you, and can predict its next waves.

### 10.3 Swarm evolution (alien research)
- The Swarm has its own tech tree, driven by Biomass and **adaptation pressure**: it tends to evolve counters to whatever humanity uses most.

| Bug type (names: section 10.5) | Hive tier | Role | Countered by |
|---|---|---|---|
| Scout | 1 | Small scouting parties that probe defenses and map biomass (section 10.2.1) | Fast reaction forces, sensors; killing them limits what the Swarm learns |
| Swarmer | 1 | Cheap melee hordes | Artillery, fortifications |
| Burrower | 1 | Tunnels; surprise attacks behind the lines | Seismic sensors |
| Harvester | 1 | Gathers biomass from controlled provinces to feed hive growth | Raids and strikes on Swarm-held provinces |
| Interceptor | 1 (about 2 weeks after landing) | Laser organ; shoots down anything airborne; creates laser coverage (section 5.4.1) | Disruption, then mechs hunting them on the ground |
| Spitter | 2 | Ranged acid; good against armor and mechs | Mechs at close range, fortifications |
| Breacher | 3 | Heavily armored; breaks through defense lines and fortifications | Mechs with anti-armor weapons, naval guns |
| Heavy Interceptor | 3 | Long-range laser (2-province coverage); can hit low orbit | Heavy disruption, mech assault |
| Siege Beast | 4 | Huge, slow; flattens defense lines and cities | Concentrated naval or orbital fire, nukes |
| Guardian | 5 (and the Super Hive) | Defends the hive core | Hive strike (orbital drop or a hive assault operation) |

*Stats and the full evolution tree are still to be written (section 17.2).*

- **The Swarm doesn't fly [DEFAULT].** Its answer to human air power is lasers, not air units.
- **Sea crossing [DEFAULT]:** the Swarm can cross **sea zones** slowly by moving along the seabed (fast in shallow zones, slow in deep ones; section 4.5). Islands buy time, but they aren't safe forever.
- **Adaptation examples:** if humans use heavy disruption, the Swarm evolves more Interceptors or longer-range Heavy Interceptors. If humans rely on mechs, it evolves more Spitters. If humans dig in, it evolves Siege Beasts.

- **Swarm structures [DEFAULT]:** Spawning Pit, Biomass Digester, Tunnel Node, Spore Tower (lowers stability in adjacent provinces), Hive Core.

### 10.4 Counter matrix
Combat uses a multiplier table (unit type × bug type). Store it in a data file so it can be tuned without code changes. Researching a counter tech improves the matching row.

A second table, **unit type × human unit type**, covers wars between humans (section 6.2). Each weapon or module has a **target profile** (anti-Swarm, anti-human or general) that sets which table it's strong in (section 11.2).

### 10.5 Naming the Swarm
**What humans call the enemy changes as they learn about it.** Names are tied to bug **knowledge levels** (section 11.1).

#### The faction
- **The object (Phase 0):** **Object Alpha**. The official designation used by observatories, governments and the news before anyone knows what it is.
- **Official designation:** **Hostile Biological Organism**. Used in UN documents, military reports and the news ("Hostile Biological Organism activity reported in…"). Abbreviation: **H-B-O** (written with hyphens to keep it distinct from the TV brand).
- **Common name:** **the Swarm**. Used by the public, soldiers and most UI text.
- **Scientific name:** given once the Xeno Lab classifies the species. **[DEFAULT: genus *Hypogea*, "underground"]**

#### Bug unit names
Every bug type has three names, shown at different knowledge levels:
- **Military codename (knowledge levels 0–1):** used before the bug is understood, and in classified research files afterwards. Codenames describe what soldiers *see it doing*, so they hint at the role.
- **Role name (knowledge level 2+):** once a bug type is understood, it's simply called by its role. This is the name used in most UI.
- **Scientific name (knowledge level 2+):** shown in the Xeno Lab, the encyclopedia and research screens, and in news about breakthroughs.

| Role name (confirmed) | Scientific name **[DEFAULT]** | Codename before identification **[DEFAULT]** |
|---|---|---|
| Scout | *Hypogea exploratrix* ("the explorer") | PROBE |
| Swarmer | *Hypogea innumerabilis* ("the countless") | HORDE |
| Burrower | *Hypogea fossor* ("the digger") | TUNNELER |
| Interceptor (laser) | *Hypogea lucifera* ("the light-bearer") | SKYWATCH |
| Heavy Interceptor (heavy laser) | *Hypogea fulminans* ("the lightning-striker") | SKYWATCH-HEAVY |
| Spitter | *Hypogea corrodens* ("the corroder") | ACIDCASTER |
| Breacher (armored breaker) | *Hypogea loricata* ("the armored one") | RAM |
| Siege Beast | *Hypogea colossea* ("the colossal") | RAMPART |
| Guardian | *Hypogea custos* ("the guardian") | WARDEN |
| Harvester | *Hypogea messor* ("the reaper") | GATHERER |
| Hive | *Hypogea matrix* ("the mother") | NEST |
| Super Hive | *Hypogea regina* ("the queen") | CROWN |

- **Codename format in reports:** "H-B-O Type-04 'SKYWATCH'", where the type number is the order of first contact in that campaign.
- **Classified research:** Xeno Lab files keep using codenames even after identification. Documents leaked through espionage use codenames too.
