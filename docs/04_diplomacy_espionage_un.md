# Terra Scutum Design: Diplomacy

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 6. Diplomacy

- **Relations** (-100 to +100) between every pair of countries. They change based on actions, shared threats, refugees, aid and history.
- **Diplomatic actions:**
  - Propose an alliance / defense pact
  - Military access
  - Research sharing agreement (pooled research progress)
  - Send aid: Industry, equipment or divisions
  - Refugee agreements: "we take X refugees in exchange for Y"
  - Sanctions / trade embargo *(F19 built their effect on trade: an embargo stops all trade between two countries, a trade agreement takes the tariffs off, sanctions are embargoes from many countries; making them through diplomacy and the UN comes in M6. See section 8.6, "How trade works in the game".)*
  - Demand / ultimatum
  - Joint operation: shared command of an offensive
  - **Declare war** (section 6.2)
- **Espionage backs up diplomacy.** Most of these actions work better, or only become possible, with an intelligence network in the target country (section 6.3).
- **AI countries** act according to their personality, public opinion and how close the Swarm is. A country with the Swarm on its border becomes much more willing to cooperate.
- **The United Nations** (section 6.4) is where countries vote on global resolutions, and it has real powers.

### 6.1 Nuclear weapons
- Nuclear-capable countries (including the player, if theirs is one) can nuke a province.
- **Effects on the target province:** massive damage to Swarm units and infestation. Can destroy a hive **only if its core is shallow (tier 1–2) [DEFAULT]**. Kills most of the population, creates a huge refugee wave from neighbors, and leaves **fallout** that lowers industry, population growth and stability for years.
- **Fallout spreads** to adjacent provinces, including other countries' provinces.
- **Diplomatic penalty:** large relation drops with every country, and the biggest drops with neighbors and countries hit by fallout. It can trigger sanctions or alliances breaking.
- **AI countries** may use nukes when desperate, which creates crises the player has to deal with.

**Lasers make nukes hard to deliver.** Nukes are mostly a political problem, but they're also a military one. They follow the same interception rule as every conventional airborne weapon (section 5.4.1).
- **Interception:** a nuke fired into a covered province is intercepted with a chance equal to its effective coverage (after disruption). An intercepted warhead **doesn't detonate**. It's destroyed, and the weapon is lost.
- **Dirty interception [DEFAULT]:** a shot-down warhead scatters some radioactive material where it falls. That's minor fallout and a smaller diplomatic penalty, but still a penalty, because the launch was seen.
- **Delivery options:**

| Method | Interception risk | Notes |
|---|---|---|
| Missile or bomber strike | Full laser coverage applies | Only realistic against a province with no lasers, or under very heavy disruption |
| Strike under a disruption barrage | Reduced by disruption | Has to be timed inside a Joint Operation (section 5.4.7) |
| Ground-delivered (a mech team carries the device in) | No air interception; the team has to survive the assault | Very risky; reaching a deep hive core this way is like a hive strike |
| Orbital drop | Laser coverage applies on descent | Needs a space program |

- **The early window:** in the first ~2 weeks after landfall, before Interceptors appear, a landing zone has no laser coverage. A nuke would work then, but it means nuking your own (or a neighbor's) territory with almost no public support and the full diplomatic penalty. That's a hard, early, irreversible decision.
- **Nukes can't hit hive cores at higher tiers** (they're too deep), so after the early window nukes are a costly, unreliable tool rather than a solution.

### 6.2 Conflict Between Humans
The Swarm is the main enemy. **Wars between humans are rare and a last resort.** They should feel like a disaster, not a normal strategy.

- **AI countries almost never start wars.** They do it only when desperate (famine, collapse, being cut off from critical resources) or after an extreme provocation (nuclear use, mass pollution, a refugee crisis forced on them). Most disputes end in sanctions, ultimatums and diplomacy.
- **The player can declare war,** but the costs are deliberately heavy: global relations, public opinion, stability, and Swarm pressure on the weakened front.
- **Conquest is limited [DEFAULT]:** war goals are about specific provinces, resources or treaties. Annexing whole countries isn't possible during the invasion.

- **Causes [DEFAULT]:**
  - **Opportunism:** taking land or resources from a weakened neighbor
  - **Refugee disputes:** closed borders, forced crossings, camps on contested land
  - **Resource wars:** food, oil, heavy metals and rare metals as markets tighten
  - **Pollution and fallout** drifting across borders
  - **Nuclear use** by another country
  - **Pre-landfall tensions:** Denial-dominated countries see others' mobilization as a threat
- **War declarations** need a **war goal** (take provinces, force a treaty, regime change, punitive strike). Declaring war during the invasion has a big **global relations and public opinion penalty**, because the world sees it as betraying humanity.
- **War weariness** builds over time, lowering stability.
- **Peace deals:** white peace, ceding provinces, reparations, forced treaties (refugee quotas, military access).
- **Internal conflict:**
  - **Insurgencies** mostly come from separatists or refugee unrest when stability is low. Pro-alien cults are **rare** and small.
  - **Civil war:** a country at very low stability can split in two. Each side takes provinces and divisions.
  - **Counter-insurgency:** garrisons, police, intelligence and laws (emergency powers).
- **Tech variants still matter** (section 11.2), but since human wars are rare, anti-human variants are mostly insurance and deterrence.
- **The Swarm benefits:** every division fighting humans isn't fighting bugs. AI countries should weigh this, and the Swarm AI can target provinces weakened by human wars.
- **Fighting humans works differently from fighting bugs:**
  - **No laser coverage.** Air power, missiles and bombers are fully effective again, so **air defense** matters.
  - **Electronic warfare, intelligence and espionage** matter (bugs don't jam radio; humans do).
  - **Mech vs mech** combat; anti-armor and anti-mech weapons are king.
  - **Nuclear deterrence** is back. Missile defense matters.
  - Units and weapons built for bugs are **less effective against humans**, and the other way around (section 11.2).

### 6.3 Espionage and Covert Influence
**Espionage works hand in hand with diplomacy and public opinion.** Diplomacy is what you do openly; espionage is how you learn what other countries really want and quietly push them toward it. It's a normal, everyday tool, unlike war.

#### Intelligence agency and networks
- Each country has an **intelligence agency**, funded by an **Intelligence** budget line (section 8.2).
- The agency builds a **network** in each foreign country (strength 0–100). Networks take time and money to grow, and they're weakened by the target's **counter-intelligence**, by blown operations, and by chaos (war, collapse).
- Network strength sets your **intel level** on that country: what you can see, and which operations you can run.

| Intel level | What you see in that country |
|---|---|
| None | Only public information: government, rough size, public relations |
| Basic (20+) | Real public opinion split, stability, budget priorities |
| Good (50+) | Military strength and deployments, research progress, what it wants from you in a deal, its AI attitude toward you |
| Deep (80+) | Secret plans (nuclear use, war plans, cover-ups), hidden insights, its intelligence operations against you |

#### Covert operations
| Operation | Effect | Ties into |
|---|---|---|
| **Gather intel** | Raises the intel level; reveals hidden information | Diplomacy (know their price), Swarm intel they're hiding |
| **Plant influence network** | Makes your **influence actions** (section 7) in that country cheaper and stronger | Public opinion |
| **Support politicians / parties** | Slowly moves the country's government and laws toward what you want (for example toward mobilization) | Public opinion, laws |
| **Media manipulation** | Pushes one opinion stance; covertly, with no relations cost unless it's exposed | Public opinion |
| **Bribe officials** | Raises the acceptance chance of your next diplomatic proposal | Diplomacy |
| **Gather leverage** | Finds compromising information you can use in negotiations: "agree, or this goes public" | Diplomacy (ultimatums, demands) |
| **Verify compliance** | Checks whether a partner really honors treaties (research sharing, refugee quotas, nuclear bans) | Treaties |
| **Influence foreign corporations** | Pushes a foreign corporation to invest in your country, sell to you, or relocate | Businesses (8.4) |
| **Industrial / scientific espionage** | Steals techs, insights or mech designs, including tech variants | Research (11) |
| **Counter-propaganda** | Cancels another country's covert influence in your country or an ally's | Public opinion |
| **Sabotage** *(rare, risky)* | Damages a building or project | Mostly used only before or during human wars |
| **Destabilize** | Funds the opposition, protests and strikes; lowers stability over time | Stability (8.9), sets up a coup |
| **Coup** | Overthrows the government and installs a friendly one | See "Destabilization and coups" below |

- **Every operation has an exposure risk**, based on its type, the target's counter-intelligence and your network strength.
- **Getting caught causes a diplomatic incident:** relations drop sharply, the target may expel your network (strength goes to 0), and a large enough scandal can shift public opinion against you there. Diplomats get sent home, and treaties can be cancelled.
- **Counter-intelligence:** spending on your own agency protects you, reveals foreign operations against you, and can turn caught operations into leverage of your own.

#### Destabilization and coups
- **Political factions = interest groups** (section 8.14). Each country's interest groups are either **in government** or in **opposition**, with their own ideologies, leaders and clout. Destabilization works by strengthening and radicalizing the groups you want, and coups are carried out by a group (often the armed forces, security services or corporate lobby) taking power.
- **Destabilize** is a long-running operation:
  - Funding opposition interest groups raises their clout, and spreading their ideology among pops grows their support.
  - Organizing protests and strikes lowers stability and output.
  - Media campaigns against the government add more pressure.
  - The effects build slowly over months, so the target's counter-intelligence has time to notice.
- **Coup requirements:**
  - **Deep intel** (network 80+) in the target
  - Target stability **below about 40 [DEFAULT]**
  - A friendly opposition interest group strong enough to take power (or a disloyal armed forces or security services group)
  - Money and Influence
- **Coup outcomes (rolled when it launches):**

| Outcome | Result |
|---|---|
| **Success** | The friendly interest group takes power. The new government's attitude toward you is high; it may join your alliance, sign treaties, change laws (for example mobilize), and open its markets to you. |
| **Partial success** | The new government is friendly but weak. Stability drops further, and a counter-coup or insurgency is likely. |
| **Failure** | The plot is crushed. Your network there is wiped out, relations collapse, and if your involvement is exposed, a **major international scandal** follows (a relations drop with every country). It can give the target a reason to go to war. |
| **Civil war** | The country splits (section 6.2). Each side takes provinces and divisions. You can back your side with aid. |

- **Friendly governments aren't puppets.** Their loyalty drifts over time based on how you treat them, their own public opinion, and other countries' influence. Rivals can try to coup them back.
- **Exposure after the fact:** even a successful coup can be exposed later, which hurts your relations with everyone and the new government's legitimacy.
- **The danger during the invasion:** destabilizing a country near the front can collapse it, leaving its provinces open to the Swarm and its refugees flooding into you. AI countries weigh this, and the player should have to as well.
- **Defense:** counter-intelligence, high stability, a loyal military, and laws such as emergency powers or state-controlled press make coups much harder. **AI countries can attempt coups against the player.** A successful coup against the player's own government counts as **government collapse** (a lose condition) unless the player defeats it **[DEFAULT]**.

#### How espionage and diplomacy work together (examples)
- **Before landfall:** a neighbor stuck in Denial blocks a defense pact. You gather intel, plant an influence network, and support pro-preparation politicians. A few months later their opinion has shifted, and the pact is accepted.
- **Negotiating a deal:** with Good intel you can see what a country actually wants (food, refugee relief, a research share), so you offer exactly that instead of guessing.
- **Pressure:** leverage turns a weak demand into one they can't easily refuse, at the risk of a scandal if they call your bluff.
- **Regime change:** a hostile government blocks refugee agreements while its people suffer. You destabilize it for a year, then back a coup by a reformist interest group. The new government signs the agreement and joins your defense pact. If it fails or gets exposed, the whole world turns on you.
- **Trust but verify:** a research-sharing partner might be holding back its best insights. Verifying compliance reveals it, and gives you grounds to renegotiate.
- **AI countries spy too.** They run the same operations on you and on each other, so counter-intelligence matters.

### 6.4 The United Nations
**The UN has real powers**, and how strong it becomes is up to the countries, including the player.
- **Structure [DEFAULT]:**
  - **General Assembly:** every member votes. It passes most resolutions by majority.
  - **Security Council:** a small group of powerful countries (permanent members based on the real 2025 setup, plus rotating ones). It decides on enforcement, sanctions and military action. Permanent members have a **veto**.
  - **Secretary-General:** a character (section 4.7) who sets the UN's agenda and can propose emergency resolutions.
- **UN authority** (0–100): how much countries respect the UN. It rises when resolutions are followed and the UN succeeds, and falls when countries ignore it. Higher authority unlocks stronger powers.
- **Powers (by authority) [DEFAULT]:**

| Power | What it does |
|---|---|
| **Resolutions** | Binding rules on refugees (quotas), nuclear use (bans), pollution, sharing Swarm intel |
| **Sanctions** | Trade restrictions on countries that break resolutions |
| **Global funds** | Members contribute money to a fund for refugees, reconstruction, or a shared research program |
| **UN Defense Force** | Members contribute divisions to a UN-commanded force that defends threatened countries, especially small ones |
| **Peacekeeping** | UN forces sent to separate countries in human conflicts, or to administer stateless provinces |
| **Global research program** | A UN-run research effort that boosts global techs (section 11.0) |
| **Emergency powers** | In a global crisis, members can vote to give the UN temporary emergency authority (for example, to coordinate a joint operation) |
| **Investigations and inspections** | UN inspectors investigate accusations, inspect nuclear sites, Xeno Labs and containment facilities |
| **War crimes tribunal** | Indicts **characters** (heads of state, ministers, commanders, CEOs) for war crimes; indicted characters lose legitimacy and can't travel, and countries may be pressured to hand them over |
| **Arms embargo** | Bans selling weapons or military goods to a country |
| **Suspension / expulsion** | Removes a country's vote and UN benefits (funds, UN Defense Force protection, research program) |
| **Authorize intervention** | Authorizes a coalition or the UN Defense Force to act against a country (protecting civilians, stopping a war, removing nukes) |
| **Recognition of governments** | Decides whether a government that came to power by **coup** (including corporate takeovers, 8.12) is recognized; unrecognized governments face penalties |
| **Reparations** | Orders a country to pay damages to the countries or people it harmed |
| **Mandates / trusteeship** | Administers stateless or devastated provinces until they can govern themselves |
| **Global food and supply program** | Coordinates food and supplies to countries in famine or collapse |
| **Technology bans** | Bans dangerous tech, for example weaponizing captured bug biology |
| **Arbitration** | Settles disputes between countries (borders, refugees, lunar sites) |
| **Swarm war command** | With enough authority, coordinates joint operations against the Swarm across countries |

#### UN reactions to world events
**The UN reacts automatically to major events.** When one happens, an **emergency session** is called, and countries vote on a response.

| Trigger | Typical UN responses |
|---|---|
| **Nuclear use** (by anyone, for any reason) | Emergency session; condemnation; investigation; sanctions; arms embargo; possible suspension and tribunal; nuclear ban resolution |
| **War crimes [DEFAULT]:** attacking refugees or civilians, firing into populated provinces on purpose, using banned weapons, mistreating prisoners | Investigation; tribunal indictments; sanctions; reparations |
| **Deliberate environmental harm:** heavy disruption or pollution poured into a neighbor's land | Condemnation; reparations; pollution limits |
| **Starting a war between humans**, especially during the invasion | Condemnation; ceasefire demand; sanctions; authorized intervention; peacekeeping |
| **Abuse of power:** suspending elections indefinitely, violent crackdowns, mass detentions under martial law | Condemnation; investigation; suspension; non-recognition |
| **Coups and corporate takeovers** (once exposed) | Recognition vote; sanctions; restoring the previous government as a demand |
| **Refugee abuse:** closing borders during a mass evacuation, refusing quotas, forced returns | Quotas enforcement; sanctions; reparations |
| **Hiding Swarm intel** or breaking research and intel sharing commitments | Condemnation; exclusion from the global research program |
| **Collapse of a country** | Mandate over its provinces; global food program; UN Defense Force deployment |

- **Infamy [DEFAULT]:** each country builds an **infamy** score from its record of war crimes and abuses. High infamy makes UN action more likely, relations worse, and coups and sanctions against it easier to justify.
- **Politics still apply:** Security Council vetoes, alliances and espionage (bribing votes) can block or water down a response, at a cost to UN authority if it's seen as a cover-up.
- **The player can be the target.** Using nukes, crushing protests or running exposed coups brings the UN down on the player too.

- **Ignoring the UN:** countries can ignore a resolution, but it costs relations, UN authority and possibly sanctions.
- **Player influence in the UN:** diplomacy, espionage (bribing votes), funding contributions, and the prestige from global techs all affect how votes go.
- **In the endgame:** UN authority strongly shapes the endgame politics and the ending (sections 3.3, 3.4). A strong UN makes world peace possible.
