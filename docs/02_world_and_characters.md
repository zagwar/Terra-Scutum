# Terra Scutum Design: Map layers (regions

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 4. World Structure: Regions, Countries and Provinces

The world has **three land layers plus sea zones**. Every province belongs to exactly **one country** and exactly **one region**. The oceans are divided into **sea zones**. Region borders and country borders are independent: a region can cover several countries, and a big country can stretch across several regions.

| Layer | What it is | Size | Used for |
|---|---|---|---|
| **1. Region** | A large geographic area (for example Western Siberia, Sahara, Great Plains, Indochina) | **About 50 [DEFAULT]** | Overall geography, climate and weather zones, **where hives are built**, world-level stats and overlays |
| **2. Country** | A real-world nation | A **curated list** of countries; tiny countries are merged into a neighbor. **Every included country is playable** for now | Politics: government, laws, budget, diplomacy, public opinion, research, armies |
| **3. Province** | A smaller part of a country (a state, a province, or part of one) | **About 1,000 [DEFAULT; lean higher rather than lower]** | **Buildings, resources, population, food, combat, movement, front lines, fortifications, infestation, refugees, pollution** |
| **4. Sea zone** | An area of ocean or sea (for example North Atlantic, Mediterranean, South China Sea). Either a **coast zone** (the water along a shore, for example North Sea Coast) or an **open-sea zone** beyond it | **About 220 [DEFAULT]**: about 120 coast zones and 100 open-sea zones | **Naval movement and combat, trade routes, amphibious landings, naval bombardment, Swarm seabed crossing** |

- **Countries are made up of provinces.** Big countries (USA, Russia, China, India, Brazil, Canada, Australia) have many. **Small countries can be a single province.**
- **Regions are made up of provinces** too, grouped by geography, not politics.
- **Ownership changes at the province level.** Wars between humans, the Swarm and country collapse all move individual provinces between owners (or to Swarm control). If a country is overrun or collapses, its remaining provinces can be taken in by neighbors, placed under an alliance's protection, or become stateless **[DEFAULT]**.

### 4.1 Which layer does what
| System | Layer |
|---|---|
| Hive placement, hive growth, landing pods | **Region** (the hive core sits in one hidden province of the region) |
| Climate, seasons, weather | **Region** (every province in it shares the weather) |
| Infestation, emergence, Swarm control | **Province** |
| Combat, movement, front lines, supply, fortifications | **Province** |
| Laser coverage and disruption | **Province** (laser range is measured in provinces) |
| Buildings, building slots, resources, farmland, population, workforce | **Province** |
| Refugees, pollution, fallout | **Province** |
| Stability | **Country**, with a local modifier per **province** |
| Laws, budget, diplomacy, public opinion, research | **Country** |
| Naval movement and combat, trade routes, naval bombardment, Swarm seabed crossing | **Sea zone** (coastal provinces border one or more sea zones) |
| Supply depots, rail, power grid | **Province** (section 5.5) |

### 4.2 Region data
`id`, `name`, `provinces`, `climate` (tropical, temperate, arid, arctic, etc.), `hemisphere`, `weather` (current state and forecast), `hive` (none, or the hive id, its core province and tier), `swarm_share` (percent of the region's provinces under Swarm control).

### 4.3 Country data
`id`, `name`, `provinces`, `capital_province`, `government_type`, `stability` (0–100), `treasury`, `debt`, `tax_rate`, `budget`, `laws`, `stockpiles` (food, resources, equipment), `business_confidence`, `corporations`, `trade_agreements`, `public_opinion` (section 7), `relations` (to every other country, -100 to +100), `alliances`, `treaties`, `wars`, `government_type`, `economic_system`, `political_capital`, `legitimacy`, `parliament` (democracies), `interest_groups` (clout, approval, leader, in government), `political_movements`, `intel_networks` (strength per target country), `counter_intelligence`, `nuclear_capable`, `ai_personality` (cautious, aggressive, isolationist, cooperative), `research_progress`, `armies`.

### 4.4 Province data
`id`, `name`, `owner_country`, `region`, `population` (with workforce breakdown, section 8.1), `buildings` and `building_slots` (section 8.3), `farmland`, `resource_deposits`, `infrastructure` (affects supply, trade and evacuation speed), `local_stability_modifier`, `terrain` (plains/forest/mountain/urban/desert/arctic), `coastal` and `port`, `fortification` (0–5), `control` (Human / Contested / Swarm), `infestation` (0–100, hidden unless detected), `laser_coverage`, `disruption`, `pollution` (0–100), `fallout` (0–100), `refugees_hosted`, `adjacent_provinces`, `adjacent_sea_zones`, `rail_level`, `supply_depot`, `power_grid` (connected / blacked out).

### 4.5 Sea zone data
`id`, `name`, `kind` (coast zone / open sea), `adjacent_sea_zones`, `adjacent_provinces` (coastal), `depth` (shallow / deep: affects how fast the Swarm can cross), `weather` (from the nearest region or its own climate), `naval_units`, `trade_routes`, `seabed_infestation` (0–100, hidden unless detected by sonar).

- **Coast zones and open sea [DEFAULT]:** the water within **200 km** of land is split off as **coast zones** that run along the shores; the water beyond is **open sea**. Islands under **5,000 km²** don't count as a coast, so the water around them stays open sea (the island still borders it, so it can be reached by sea). A sea that is near land almost everywhere (the Baltic, the English Channel) is a coast zone as a whole. Land provinces border coast zones; only tiny islands border open sea directly. *(What coast zones mean for naval rules comes with the naval features, M8b.)*
- Ships move between sea zones. A ship in a sea zone can bombard, support or land troops in **adjacent coastal provinces**.
- **Ports** are buildings in coastal provinces. Ships need them for supply, repair and building.
- **The Swarm crosses the sea** through the seabed of sea zones: shallow zones fast, deep zones slowly **[DEFAULT]**. Sonar networks and submarines detect seabed infestation.

### 4.6 Hives and regions
- **Hives can only be built at the region level.** A region holds **at most one hive [DEFAULT]**. Its core sits in one province, which is hidden until it's detected.
- **Landing pods** target regions. The pod picks a province inside that region for the core.
- **Seeding a new hive:** **only while the Super Hive is alive** (section 10.1), a hive at tier 3 or higher can seed a new one in an **adjacent region that doesn't have a hive yet**, once the Swarm controls at least one province there.
- **Hive range:** a hive spreads infestation through tunnels to the provinces in its own region first, then into provinces of neighboring regions as its tier rises.
- **Region-level stats** (percent under Swarm control, hive tier) make it easy to see the big picture on the world map.

### 4.7 Characters
The world is run by **named characters**. Mech pilots, aces and commanders are covered in section 5.3; this section covers everyone else.

| Character | Where | What they do |
|---|---|---|
| **Head of state / government** | Every country | Sets the government's agenda, traits affect political capital, stability and diplomacy. Changes through elections, coups, succession, death or resignation |
| **Ministers** [DEFAULT: defense, finance/economy, foreign affairs, interior, science, intelligence] | Every country's cabinet | Each gives bonuses in their area (for example, a good finance minister lowers borrowing costs). Appointing them is political: ministers come from **interest groups** (section 8.14), and their **ideology** decides what they push for. Leaving a group out costs its support |
| **Lead scientists** | Research centers, state institutes, Xeno Labs, and corporations' R&D | Lead a research branch or lab; bonuses to speed and **breakthrough chance**; some specialize (xenobiology, materials, lasers, space) |
| **CEOs** | Every corporation (section 8.4.1) | Run the corporation; their traits drive its decisions (cautious, aggressive, patriotic, profit-first). Boards can replace them, and the government can pressure that through influence |

- **Every character has:** a name, age, nationality, portrait **[DEFAULT: simple generated portraits]**, **traits** (for example Charismatic, Corrupt, Brilliant, Hawkish, Cautious, Populist), **competence** in their role, **ideology** (section 8.14; every character has one, and it decides which laws, government types and economic systems they support), **interest group** (political characters), **loyalty** (to the government or company), and **opinion of the player**.
- **Characters change:** they gain experience, develop new traits through events, age, get sick, die, retire, resign in scandals, or defect. Leaders can be killed in Swarm attacks on their province.
- **Characters drive events:** ministers threaten to resign, scientists ask for funding for a hunch, CEOs propose deals or get caught in scandals, heads of state make speeches that shift opinion.
- **Espionage and characters (section 6.3):** gather leverage on a foreign minister, bribe officials, support a rival candidate, or poach a foreign lead scientist.
- **Real-world people [DEFAULT]:** all characters are **fictional**, including heads of state, even though countries are real. That avoids putting words in real people's mouths.
- **Scale:** characters are only generated for roles that exist. Small countries have a small cabinet, and corporations have one CEO each.
