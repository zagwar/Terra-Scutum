# Terra Scutum Design: Global techs and country projects

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 11. Research

**Research works like Terra Invicta: there are global techs and country projects.**

### 11.0 Global Techs and Country Projects
| | **Global techs** | **Country projects** |
|---|---|---|
| What they are | Humanity's shared scientific progress: fundamental breakthroughs | A country's own applied programs: units, modules, buildings, variants, doctrines |
| Who researches | **Every country contributes** research points to the global tech currently being researched | Only the country itself (plus partners in sharing agreements, and corporations, 11.4) |
| Who benefits | **Everyone** gets the tech when it completes | Only that country (unless shared, traded or stolen) |
| Examples | Materials science, fusion power, xenobiology fundamentals, laser physics, advanced AI, orbital engineering | A Gen 2 mech frame, a laser-resistant coating module, a disruptor-round factory, a doctrine |

- **Global techs are prerequisites for country projects.** For example, the global tech *Bio-laser Physics* unlocks country projects like *Laser-resistant Coating* and *Human Laser Air Defense*.
- **Contributing to global techs:** each country chooses what share of its research goes to the global pool and what share goes to its own projects. Countries that contribute more get **credit**.
- **Credit and leadership [DEFAULT]:**
  - The **top contributor** to a global tech gets bonuses when it completes: prestige (an Influence boost and better relations), a head start on related country projects, and a say in which global tech humanity researches next.
  - Global tech choices are **voted on** among contributors, weighted by contribution, so big research powers steer humanity's science.
- **Freeloading:** a country can put almost nothing into the global pool and still get global techs. That saves research, but it costs prestige and relations, and gives no say in what comes next.
- **Insights feed global techs.** Insights from experiments (11.1) belong to the country that made them. **Publishing** an insight adds a big boost to the related global tech and earns prestige. **Keeping it secret** gives you a private advantage on the related country projects. That's a real choice.
- **Research sharing agreements** (section 6) pool **country project** progress between partners. **Espionage** can steal country projects and secret insights (section 6.3).

### 11.0.1 Branches
Each branch has global techs and country projects.
- **Branches:**
  - *Conventional* (available before landfall): industry, logistics, fortifications, infantry and armor upgrades
  - *Xenobiology*: **not researched like normal techs.** It's unlocked through captures, samples and experiments (section 11.1).
  - *Detection*: seismic sensors, deep radar, tunnel mapping
  - *Weapons & Armor*: acid-resistant armor, anti-armor rounds, mech melee weapons
  - *Mech Walkers*: frames (Gen 1, 2, 3 and variants), and **modules** for every designer slot: weapons, melee, armor, coatings, mobility, electronics, special. Also pilot training and mech carriers. **Locked until after landfall** (section 11.3).
  - *Conventional*: better infantry equipment, tanks, rocket artillery, fortification tech, cold-weather gear
  - *Environment*: heavy-metal remediation, weather forecasting, hardier crops
  - *Combined Arms*: disruptor rounds, better heavy-metal clouds (density, how long they last), laser-resistant coatings, naval bombardment, joint operations doctrine, battlefield communications
  - *Space*: spaceports, satellites, orbital platforms, orbital drop divisions, an object interception mission
  - *Society*: refugee integration, propaganda/influence, evacuation logistics
  - *Endgame*: **Hive Breaker**, which unlocks destroying tier 3+ hive cores (needed to start Phase 3, section 10.1)
- Every tech has: `id`, `name`, `branch`, `scope` (global or country), `cost_rp`, `prerequisites` (global techs, country projects and/or **insights**), `effects`, `variants` (11.2), `unlock_condition` (for example "after landfall", 11.3).

### 11.1 Xenobiology: Captures, Samples and Experiments (XCOM / Terra Invicta style)

**You can't learn about the bugs from a desk.** Knowledge about the Swarm comes
only from what you physically bring back and study. Normal research points
help, but the gate is always **specimens**.

#### Specimen types
| Specimen | How to get it | Unlocks studies of |
|---|---|---|
| **Corpse** (per bug type) | Recovered after battles you win in a province; quality depends on how it died (artillery leaves little; mech melee leaves more) | Anatomy, weapons organs, armor |
| **Live capture** (per bug type) | A **capture operation**: needs capture modules (mech special slot or capture teams), a won battle, and free **containment** space | Behavior, senses, communication, how lasers target, reaction tests |
| **Hive tissue / structure samples** | **Hive expeditions**: raids into tunnels and hive levels. Shallow levels are easier; the core is the hardest | Hive growth, tunnels, biomass, how new bug types are made, the hive core |
| **Swarm structures** | Captured when you retake a province (Spawning Pit, Tunnel Node, Spore Tower…) | That structure, Swarm infrastructure |
| **Traded specimens** | Diplomacy: trade or share with allies (section 6) | Same as the source |

- **Specimens decay.** Corpses rot and need cold storage. Live captives die over time unless the containment facility is good enough to keep them.
- **First specimens of a new bug type** always need a fight against it, so humans are always studying from one step behind.

#### Facilities (buildings, section 8.3)
- **Xeno Lab:** runs **experiments**. Each lab runs one experiment at a time; better labs run faster and more safely.
- **Containment Facility:** holds live captives. Capacity depends on bug size: a Swarmer takes 1 slot, a Breacher takes 5, and a Siege Beast can't be held at first. Containment level sets the **breach risk**.
- **Cold Storage:** keeps corpses and tissue from decaying.
- Facilities in provinces near the front are at risk. If the province falls, its specimens and captives are lost.

#### Experiments
- An **experiment** is a project that uses specimens (some consume them, some don't), lab time and research points. When it finishes, it gives an **insight**.
- **Experiment types [DEFAULT]:**

| Experiment | Needs | Typical insight |
|---|---|---|
| Autopsy | Corpse | Anatomy, weak points (a damage bonus against that bug type) |
| Organ analysis | Corpse (good quality) | How a specific organ works (the acid gland, the laser organ) |
| Behavior study | Live capture | How it targets and moves; better AI predictions and ambush bonuses |
| Stress test | Live capture (often fatal) | Resistances: heat, cold, chemicals, sound |
| Laser organ live test | Live Interceptor | Targeting priorities, better disruption, laser coatings |
| Hive tissue analysis | Hive samples | Biomass, growth, tunnel prediction |
| Swarm signal study | Live capture + hive samples | How bugs communicate; can warn of evolutions and attacks |
| Core study | Hive core sample | **Required for Hive Breaker** |

- **Outcomes have some randomness:** an experiment can produce a big breakthrough, a normal insight, a partial result (repeat with more specimens), or a **failure** that loses the specimen.
- **Incidents:** live experiments carry a risk of **containment breach**: lost staff, building damage, a stability hit, and in bad cases a small Swarm outbreak in the province. Better containment lowers the risk.

#### Insights and knowledge levels
- **Insights** are discoveries like "Laser Organ Refraction Weakness" or "Tunnel Pressure Signature." They show up as the **prerequisites** for normal techs. For example, the *Laser-resistant coating* module needs the insight *Laser Organ Structure*.
- Each bug type has a **knowledge level** that rises as insights are found:
  - 0 = Unknown: only a military codename and silhouette; stats hidden (naming in section 10.5)
  - 1 = Encountered: basic stats visible
  - 2 = Autopsied: weak points known; small combat bonus; the bug gets its role name and scientific name
  - 3 = Studied alive: behavior known; enemy movement predictions
  - 4 = Weakness found: unlocks counter-tech research
  - 5 = Mastered: full counter bonus
- **Knowledge affects what the player can see.** Unknown bug types show "?" stats in combat reports. Better Swarm knowledge improves the intel in section 10.2 and can **warn about upcoming Swarm evolutions** before they appear.
- **Terra Invicta feel:** insights also unlock **events and story beats** that reveal more about what the Swarm is and why it came **[DEFAULT: lore to be written]**.

#### Politics of experiments [DEFAULT]
- Before landfall, people in the **Contact** stance (section 7) protest live experiments, which costs stability. After landfall, opposition is small (rare cults only). Big breakthroughs that are made public raise the **Prepare** stance.
- Sharing insights with allies improves relations. Keeping a breakthrough secret is an option, so your country benefits alone.

### 11.2 Tech Variants: Anti-Swarm vs Anti-Human

Many techs come in **two variants**, one optimized against the Swarm and one against humans. Researching both costs more, so the player has to decide what kind of war they're preparing for. Before landfall, nobody knows for sure which war is coming.

- **Variant rules:**
  - A tech with variants has a shared **base tech** and then two **variant branches**. Researching one variant makes the other cheaper (about 50% **[DEFAULT]**), but never free.
  - Each variant gives modules, ammo or upgrades tagged with a **target profile**: anti-Swarm, anti-human or general.
  - In the **Mech Designer** (5.4.9) and division templates, the player picks which variant goes on a design. A design can be built for bugs, for humans, or as a compromise.
  - Variants built for one enemy work at **reduced effectiveness** against the other (about 50–70% **[DEFAULT]**), so they're never useless.

- **Example variant pairs [DEFAULT]:**

| Base tech | Anti-Swarm variant | Anti-human variant |
|---|---|---|
| Autocannon ammo | High-volume fragmentation (shreds hordes) | Armor-piercing sabot (kills vehicles and mechs) |
| Mech main weapon | Large-magazine assault cannon | Precision long-range rifle with better fire control |
| Mech melee | Heavy blade for bug carapace | Light blade, balanced for agile mech duels |
| Mech armor | Acid- and laser-resistant coatings | Composite armor against kinetic and explosive rounds |
| Mech electronics | Seismic and bio sensors (detect burrowers) | Radar, ECM and stealth (beat human sensors and missiles) |
| Artillery shells | Disruptor rounds, area saturation | Guided precision rounds |
| Missiles | Massed cheap rockets to saturate lasers | Guided missiles with countermeasures |
| Air power | Laser-window strike tactics, rugged airframes | Air superiority fighters, stealth, air-to-air missiles |
| Air defense | Not needed (the bugs don't fly) | SAMs, anti-air guns, **missile defense** |
| Fortifications | Anti-horde walls, kill zones, tunnel blockers | Bunkers, anti-tank lines, hardened shelters |
| Infantry equipment | Flamethrowers, heavy area weapons | Rifles, anti-tank weapons, body armor |
| Doctrine | Defense in depth against hordes; disruption timing | Maneuver warfare, combined air-land battle |

- **Human-conflict-only branches:**
  - *Air Defense*: SAMs, interceptors, missile defense (also against nukes)
  - *Electronic Warfare*: jamming, ECM, stealth, secure communications
  - *Counter-insurgency*: policing, informants, propaganda against collaborators
  - *Nuclear Deterrence*: second-strike capability, early-warning systems
- **Cross-over techs (xenobiology → human use):** some insights unlock techs useful against humans. For example, studying the laser organ can lead to **human laser air defense**, which shoots down human missiles and aircraft the way bugs do. That's a huge advantage in a human war, and a reason other countries might want your specimens.
- **Stealing tech:** espionage can steal another country's techs or insights, including variants (section 6.3).
- **Intelligence branch** (useful in peace and war): agency efficiency, network growth, cover identities, counter-intelligence, cyber operations, signals intelligence.

### 11.3 Locked Tech: Nobody Knows What's Coming
**Before landfall, the world doesn't know what the Swarm can do, and the tech tree reflects that.** The player can't use their own outside knowledge.
- **Hidden until triggered [DEFAULT]:** techs about things nobody has seen yet are hidden or locked until a **trigger event** reveals them:

| Locked tech | Unlocked by |
|---|---|
| **Mech Walker frames** (the whole mech branch) | **Landfall.** Development starts after arrival. Prototype first, then the first production frame; it takes months **[DEFAULT]** |
| Laser countermeasures, disruptor rounds, laser-resistant coatings | **First laser contact** (about 2 weeks after landfall) |
| Counter techs for each bug type | That bug type's knowledge level (11.1) |
| Hive Breaker | A hive core sample and the core study insight |
| Seismic tunnel mapping | First burrower emergence |

- **Before landfall,** research goes into conventional preparation: industry, infrastructure, conventional forces, fortifications, space, society, and the object-interception mission.
- **The early war is fought with what you prepared:** conventional armies, fortifications, artillery and naval guns. Mechs, disruption doctrine and counter techs come in during the war.

### 11.4 Private vs State Research
**Countries have two kinds of research, and the difference is control vs cost, not speed.**

| | **Private (corporate) research** | **State research** |
|---|---|---|
| Who pays | **The corporation.** It's free for the government | **The government** pays upkeep every day (labs, staff, equipment) |
| Who decides what's researched | **The corporation**, based on its sector, profit, traits and the market. **The government can't directly control it.** | **The government, directly.** It picks the exact projects |
| Speed | Comparable. It depends on the corporation's size and innovation trait | Comparable. It depends on funding and facilities (research centers, institutes) |
| How the government steers it | **Research grants** (nudges), contracts, lobbying deals | Direct assignment |
| Contributes to | Country projects in its sector, and global techs | Any country project or global tech the government chooses |

#### Private research
- Corporations with research capacity (tech, defense, energy, manufacturing and similar sectors) run **their own research programs** at no cost to the government. Their progress goes into the country's **country projects** and **global techs**.
- **What they choose** depends on their sector, what's profitable, what the market and the war demand, and their traits. A defense corporation might work on better armor while you want anti-laser coatings.
- **Research grants (the nudge):** the government pays a grant to tilt a corporation toward a direction ("anti-laser technology," "mech mobility"). It makes that direction more attractive; it doesn't force it. Bigger grants nudge harder, and corporations whose traits fit the direction respond better.
- **Research contracts (a stronger nudge):** the government pays for a specific project. The corporation is far more likely to do it, but it costs a lot more, and the result may be a **company product** the corporation owns and sells (to you and, for multinationals, to others).
- **Lobbying:** corporations ask for grants and contracts in their sector, and may offer to share costs.

#### State research
- **Research centers, state research institutes and military labs** are government buildings. They run on the **research budget** (upkeep), and the government assigns them projects directly.
- State research isn't slower. It's **controllable but expensive**: every point of state research is paid for out of the budget.
- **Classified projects:** state research can be kept secret (harder to steal, and it isn't shown to partners), which private research can't do as easily.

#### How economic systems use them
- **Free market:** most research is **private**: cheap for the government, but it has to be steered with grants and contracts. The state can still build its own labs and pay for them.
- **Mixed economy / state capitalism:** a mix. State capitalism can pressure corporations harder (stronger nudges for the same money).
- **Command economy:** **only state research.** Full control, but the government pays for all of it.

#### Why corporations are worth keeping
- **Nationalizing** a corporation, or letting it go **bankrupt**, turns its free research into either nothing or **state research the government now has to pay for**. In exchange, the government gets direct control.
- The research screen shows each corporation's research output and current focus, so the player can see what they'd gain and lose.
