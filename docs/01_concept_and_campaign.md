# Terra Scutum Design: Concept

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 1. Concept

**One-sentence pitch:**
An unknown object is on course for Earth. You lead one real-world nation through
two years of public confusion, political maneuvering and preparation before an
alien bug swarm lands, digs in and starts spreading underground. You have to
hold the line, manage the refugees fleeing across borders, work with (or around)
the other nations, study the enemy, and eventually push it back and destroy every hive.

**Start date:** **January 2025.** The object is detected at game start; arrival is about **January 2027** (24-month countdown). Every country starts with an approximation of its **real 2025** economy, military, technology, government and space program. **Mechs don't exist in 2025, and nobody thinks to build them before the bugs arrive.** Mech development can only **start after landfall** (section 11.3), so the early war is fought with conventional forces.

**Genre:** Grand strategy set in a global alien invasion
**View:** **3D, top-down/angled camera** over the world, like Hearts of Iron IV or Terra Invicta. Battles can be watched up close in a 3D battle view (section 5.7).

**Inspirations (for feel, not for copying; use no names, units or terms from them):**
- *Terra Invicta*: influencing public opinion about the alien threat, a slow alien buildup, research racing the threat
- *Hearts of Iron IV*: real nations, real-time with pause, fronts and divisions on a map, industry, diplomacy
- *XCOM*: a research loop fed by alien samples; units and pilots with names, histories and progression that you get attached to (no squad missions)
- *Muv-Luv (Alternative)*: humanity losing ground to an alien hive species, hives that grow underground, nations straining under refugees and politics, and above all its **combined-arms doctrine**: laser-armed aliens take the sky away, walking mechs become the main battle unit, and naval, artillery and orbital fire exist to blind the lasers so the mechs can get in
- *Factorio*: an alien population that expands, adapts and pushes back
- *Helldivers*: bug warfare, distinct bug types that each need their own answer

**Target session length:** a full campaign is roughly 10–20 hours over many sessions, with saving and loading.

## 2. Design Pillars

1. **Time is the real enemy.** The prep phase is a countdown, and the early invasion feels inevitable. The player is buying time until the tide can turn.
2. **What you can't see is growing.** Hives expand underground. Intel and detection decide whether the player gets surprised.
3. **An army is only as strong as the country behind it.** Running the economy, food, industry and population is half the game.
4. **Humanity is not united.** Nations have their own interests, and sometimes they go to war with each other. Getting them to cooperate is as hard as fighting the bugs.
5. **Every lost province has a human cost.** Losing territory creates refugees who cross borders and strain politics.
6. **Knowledge turns the tide.** Humanity wins by studying the bugs and building counters.
7. **The sky belongs to the bugs.** Interceptors (the laser bugs) make normal air power useless. Victory comes from combined arms: blind the lasers, then strike.
8. **Both sides adapt.** The Swarm evolves new units in response to how humans fight.

## 3. Campaign Structure

| Phase | Trigger | What happens | Player focus |
|---|---|---|---|
| **0. Detection** | Game start (January 2025) | An object is detected, and a 24-month countdown begins. The world doesn't know how to react; public opinion is split (section 7). | Shape public opinion at home and abroad, build alliances, push nations to prepare, build industry and defenses. |
| **1. Landfall** | Countdown ends | 1–3 landing pods come down in random **regions**, weighted toward less prepared ones. Each one seeds a Hive in that region. **There are no later reinforcements from space**: everything the Swarm becomes grows from these first landings. | React fast, contain the landing zones, get the first bug samples, coordinate with the affected nations. |
| **2. The Spread** | First Hive reaches tier 2 | Hives grow, tunnel under neighboring provinces and evolve new unit types. Fronts form and refugees cross borders. | Hold the line, manage refugees, keep allies together, research counters. |
| **3. Counteroffensive** | **The first tier-5 hive is destroyed** (needs the Hive Breaker tech, section 11) | Humanity proves the big hives can be killed. Humans retake provinces and destroy hives. | Lead joint offensives, cut tunnel networks, rebuild retaken provinces (section 9.1). |
| **4. The Hunt for the Super Hive** | The Swarm is **in retreat** (Swarm-controlled land has fallen to half its peak **[DEFAULT]**) | The bugs are no longer an existential threat, so **countries turn on each other's ambitions** (section 3.4) while the hunt for the hidden Super Hive goes on. The Super Hive keeps seeding new hives until it dies. | Find and destroy the Super Hive while managing the politics of the coming post-bug world. |
| **5. Extermination** | The **Super Hive is destroyed** | The Swarm **can't create new hives** any more, and stops evolving new bug types **[DEFAULT]**. Every remaining hive still fights on and **has to be destroyed one by one**. | Destroy the remaining hives while the endgame politics play out. |

**Win condition:** **exterminate the Swarm: destroy every hive, including the Super Hive.** Killing the Super Hive first matters, because while it lives it keeps making new hives. The **ending** depends on the state of the world when the last hive dies (section 3.3).
**Lose conditions (any one):**
- The player's nation loses all of its provinces, or its government collapses (stability 0)
- The Swarm controls more than 60% of Earth's land provinces **[DEFAULT]**
- World population falls below 30% of its starting value **[DEFAULT]**

### 3.0 Game Setup
When starting a new game, the player can set **[DEFAULT values in brackets]**:
- **Country** (any included country)
- **Difficulty** (affects Swarm strength, AI competence and starting bonuses) [Normal]
- **Countdown length** (12–36 months) [24]
- **Number of landing pods** (1–5) [1–3, random]
- **Swarm aggression and evolution speed** [Normal]
- **AI country aggression** (how willing AI countries are to go to war or run coups) [Normal]
- **Random seed** (for reproducible games) [random]
- **Ironman mode** (one save, no reloading) [off]
- **Historical vs randomized start** (real 2025 governments vs randomized ones) [Historical]

### 3.1 Events, Journal Entries and Decisions (Victoria 3-style)
The story of each campaign is told through three connected systems:

| System | What it is | Example |
|---|---|---|
| **Events** | Something happens; the player (or AI) picks one of 2–4 options, each with effects | "Panic buying in Lagos: release food reserves / send police / do nothing" |
| **Journal entries** | **Ongoing situations** shown in a journal, with a goal, progress bars, a timer and/or failure conditions. They fire events along the way and give rewards or penalties when they end | "The Object Approaches" (Phase 0 countdown), "Refugee Crisis in Poland," "The Mech Program," "Hive Siege of Xinjiang" |
| **Decisions** | **Player-started actions** that become available when conditions are met, often with a cost | "Declare a National Emergency," "Relocate the Capital," "Form a Continental Defense Pact," "Evacuate the Coast" |

#### Events
- **Triggers:** each event has conditions (date, phase, stability below X, a province lost, a bug type first seen, a corporation going bankrupt, and so on) and either fires immediately or has a **chance per week** while its conditions are true.
- **Options:** each option has effects (money, stability, opinion, relations, laws, units, character changes, starting a journal entry, firing another event). Options can be **locked** unless conditions are met (for example, only available with a certain law or minister).
- **Event chains:** events can lead to follow-ups days or months later, forming small storylines.
- **AI countries** get the same events and choose using weights based on their personality.
- **Categories [DEFAULT]:** Phase 0 and the object, public opinion, politics and elections, economy and markets, corporations and CEOs, characters, military and battles, refugees, Swarm (first contacts, new bug types, emergences), science and breakthroughs, diplomacy and espionage, disasters (blackouts, famine, breaches), and **story and lore beats**.
- **Pacing:** important events pause the game (setting); minor ones show as notifications.

#### Journal entries
- Each journal entry has: a description, **goals** (complete to succeed), **failure conditions**, an optional **timer**, **progress bars** (for example "Mech Program: prototype 60%"), and the events it can fire.
- **Global journal entries** track the big picture: "The Object Approaches," "Landfall," "The Spread," "Counteroffensive," "The Hunt for the Super Hive," "Extermination" (the campaign phases, section 3).
- **Country journal entries** track what's going on in the player's country: crises, programs, reforms, ongoing battles for key provinces.
- The journal is the player's **to-do list for the campaign**: it shows what matters right now.

#### Decisions
- **Decisions** sit in a decisions screen and become available when their conditions are met. Each shows its **requirements**, **cost** (money, political capital, Influence) and **effects** before the player commits.
- **Examples [DEFAULT]:** declare a national emergency; relocate the capital; nationalize a sector; call an emergency global summit; launch the object-interception mission; publish xenobiology findings worldwide; order a mass evacuation of a region; form a continental alliance; announce an amnesty for draft dodgers.

#### Data-driven scripting
- Events, journal entries and decisions are defined in **data files** (`data/events/`, `data/journal/`, `data/decisions/`) with a simple format: id, text (with variables like country, province and character names), conditions, weights, options and effects.
- **The game logic is a small library of conditions and effects** that every event can use. Adding content means writing data, not code.

### 3.2 News System
The news shows the player what's happening in the world, commenting on events, battles and the progress of the war.

- **News feed:** a running feed of headlines, generated from what happens in the simulation: battles won and lost, provinces falling or retaken, new bug types, hives growing, elections, coups, corporate bankruptcies, market crashes, refugee waves, breakthroughs, summits, nuclear use.
- **Front pages [DEFAULT]:** a weekly newspaper-style front page with the biggest stories, a **war progress** summary and a short world digest.
- **War progress reports:** monthly briefings with charts: Swarm control over time, front-line changes, losses, refugees, hive tiers, production of key goods.
- **Local and foreign perspectives:**
  - The player's **own press** reports the news, colored by the **press law** (section 8.8). A state-controlled press spins defeats into "strategic withdrawals."
  - The player can read **foreign press** too. With intelligence (section 6.3), the player also sees what other governments are really saying.
- **Named units and characters** appear in the news ("Ace pilot Mara Kessel downs her 40th Interceptor").
- **Templates:** headlines are built from data-driven templates with variables, with several variations per type so they don't repeat. Importance scoring decides what reaches the front page.
- **News affects the world (lightly) [DEFAULT]:** big stories nudge public opinion. Propaganda options (press law, media budget) can amplify or bury stories at home.
- **Filters:** by country, category and importance. Clicking a headline jumps to the province, battle or screen it's about.

### 3.3 Endings
**There are multiple endings, decided by the state of the world when the campaign ends** (when the last hive is destroyed, or on a loss). The game scores several factors and picks the ending that fits. Each ending gets an **epilogue**: a sequence of news-style front pages describing what happens next, plus a final **world summary** (charts of the war, the player's record, named heroes, the memorial).

**Factors that decide the ending [DEFAULT]:** world population left, how much land is livable (pollution, fallout), how strong and trusted the UN is, how many human wars and nuclear strikes happened, the player country's power and reputation, refugees resettled or not, and whether the player used coups, nukes or secrets.

**Example endings [DEFAULT]:**
| Ending | Roughly when |
|---|---|
| **A United Humanity** | Strong UN, no major human wars, high cooperation; the world builds a shared future |
| **Pyrrhic Victory** | The bugs are gone, but the population was devastated and the land is poisoned |
| **The Long Peace** | Rival blocs, but they avoid war; an uneasy, stable balance |
| **A New Cold War** | Blocs armed with alien-derived tech facing off |
| **Hegemony** | The player's country dominates the post-bug world, by influence, coups or force |
| **Ashes** | Nuclear use and human wars left the world shattered, even though the bugs lost |
| **Lunar Exodus** *(loss variant)* | Earth is lost, but a Moon base (section 5.4.6) carries humanity on |
| **Earth Lost** *(loss)* | The Swarm won |
| **The Fall of [Country]** *(loss)* | The player's country collapsed or was overrun, while the war went on without it |

### 3.4 Endgame Politics: the Race for the Post-Bug World
**The "aftermath problems" start before the war is over.** Once the Swarm is in retreat (Phases 4 and 5), the bugs are still dangerous locally but no longer threaten humanity's survival. Countries start thinking about the world that comes after, and that creates tension while the player is still hunting the Super Hive and the last hives.
- **Power competition:** countries compete for stateless provinces, alien tech and insights, UN influence, lunar assets (section 5.4.6), markets and alliances. Old rivalries come back, and wartime alliances start to fray.
- **Divided effort:** some countries pull troops back from the Swarm fronts to strengthen their position at home or against rivals, which makes the remaining hives harder to kill.
- **Reconstruction** (section 9.1) becomes a major economic and political task, and a source of competition (who rebuilds stateless provinces, and who gets the contracts).
- **War isn't guaranteed.** AI countries weigh the costs, and most disputes are settled through diplomacy, the UN, trade and espionage. War is possible, but rare.
- **World peace is an option.** A strong UN, treaties, disarmament and shared reconstruction can lead to the peaceful endings. Pursuing peace has its own decisions and journal entries.
- **The campaign ends** when the last hive is destroyed (or on a loss), and the ending reflects the political situation at that moment (section 3.3).
