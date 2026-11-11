# Terra Scutum Design: Government types

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 8. Running the Country (continued): Politics

### 8.12 Government Types and the Political Process
**Different government types have different hurdles to overcome to push their agenda.** Laws, budgets and big decisions don't just happen; they need support.

| Government type [DEFAULT] | Who has to agree | Hurdles | Strengths |
|---|---|---|---|
| **Parliamentary democracy** | A majority in parliament, often a coalition of parties | Coalitions can collapse; elections every few years can change the government; laws pass slowly | High legitimacy and stability; strong relations with other democracies |
| **Presidential democracy** | The president plus the legislature (which may be controlled by the opposition) | Gridlock when the legislature opposes the president; term limits; elections | Strong executive actions on defense and foreign policy |
| **Constitutional monarchy** | Like a parliamentary democracy | Same as parliamentary | A monarch adds stability in crises |
| **Authoritarian / one-party state** | Key interest groups: the party (civil service), armed forces, security services, corporate lobby | Groups must be kept loyal; angry groups can stage a coup | Laws pass fast; little public resistance; easier mobilization |
| **Military junta** | The military leadership | Low legitimacy; frequent coup risk; poor relations with democracies | Very fast mobilization; strong military bonuses |
| **Absolute monarchy** | The monarch and elite interest groups | Succession crises; elite unrest | Fast decisions; stability tied to the ruler |

- **Politics work like Victoria 3:** ideologies, interest groups, legitimacy and political movements are described in **section 8.14**. This section covers what's different for each government type.
- **Political capital [DEFAULT]:** the government earns **political capital** over time, based on legitimacy. Changing laws, starting reforms and big budget shifts cost political capital, plus the support of the right **interest groups** (8.14).
- **Interest groups and parties:** every country's politics are made of **interest groups** (section 8.14). In democracies, interest groups form **parties** that win seats in elections; in other systems, interest groups are **power blocs** whose clout depends on the government type (the armed forces have huge clout in a junta, the corporate lobby in a corporate state).
- **Passing a law:**
  - Works the same way in every government type (section 8.14): interest groups support or oppose the law based on their ideologies, and the law advances, stalls or fails over time.
  - **Democracies:** support is measured by **parties' seats**, and the player can bargain with parties (concessions, budget promises, coalition deals).
  - **Non-democracies:** support is measured by the **clout** of the interest groups in power. Ignoring a powerful group makes it angry and raises coup risk.
- **Elections (democracies):** every few years **[DEFAULT: real-world schedules where possible]**. The result depends on approval, stability, the economy, the war and public opinion. A new government brings its own agenda. The player stays in control, but has to work with whoever won.
- **Emergencies:** after landfall, "national emergency" laws can suspend elections or speed up law passing. That costs legitimacy and is harder in democracies.
- **Changing government type** happens through revolutions, coups (6.3), corporate takeovers (below), or long reform processes. It's rare and dramatic.

#### Corporate governments
**Corporations can take over governments.** A country run by corporations gets one of several **corporate government types** and **corporate economic systems** (section 8.13).

| Corporate government type [DEFAULT] | Who rules | Hurdles | Strengths |
|---|---|---|---|
| **Corporate republic** | A legislature where votes are weighted by **shares and assets** | Shareholders demand profits; less legitimacy with the public; unrest from workers | Efficient economy; strong corporate research and construction |
| **Corporate directorate** | A **board of CEOs** from the biggest corporations | Board members compete; a falling-out can split the country | Fast decisions on economic matters; big investment |
| **Company state** | **One megacorporation** owns the country outright | Everything depends on that company's finances; a bankruptcy becomes a national crisis | Total control; the company's resources are the state's resources |
| **Technocratic consortium** | A council of corporate scientists and engineers | Low public legitimacy; slow on politics | Big research bonuses; good at megaprojects (the Moon) |

**How corporations take over [DEFAULT]:**
- **Debt capture:** a country that defaults on its debts to corporations (or to corporate-owned banks) hands them control of its institutions.
- **Political capture:** corporate lobbying and funding grows the Corporate Lobby interest group or a corporate party (section 8.14) until it wins power.
- **Corporate coup:** a corporation with huge wealth and **private security forces [DEFAULT]** backs a coup (section 6.3) against a weak, unstable government.
- **Filling a vacuum:** when a country collapses, corporations can take over administering its stateless provinces ("company towns"), which can grow into a corporate state.
- **The player can be a target.** A powerful corporation with a hostile attitude toward the government is a coup risk, like a disloyal Armed Forces interest group. If it happens to the player, it counts as a government collapse unless the player defeats it.
- **The player can also play as a corporate-run country**, either from a randomized start (section 3.0) or after a takeover in an AI country changes the map.
- **The UN reacts** to corporate takeovers like any other coup (recognition vote, section 6.4).

### 8.13 Economic Systems
**The country's economic system decides who owns industry and how the government gets what it needs.** Corporate lobbying and the government's control over production both depend on it.

| Economic system [DEFAULT] | Who owns industry | How the government gets military goods and supplies | Corporate lobbying |
|---|---|---|---|
| **Free-market capitalism** | Private corporations own almost everything; **no state-run industry at the start** | **Buys** from corporations at market prices, through contracts it has to **negotiate** | **Strong:** corporations lobby hard; the government has to negotiate and work with them to steer production |
| **Mixed economy / social market** | Mostly private, plus some state-owned companies (utilities, rail) | Mostly buys from corporations; some direct production | Moderate |
| **State capitalism** | Private corporations under **heavy state influence**, plus **significant state-run industry** | Directs state companies; can pressure private ones with directives | Weak: corporations mostly follow state direction, but still have interests |
| **Command economy** | **Only state-run industry**; no private corporations | **Plans** production directly through quotas | None (no corporations) |

- **Construction** follows the same pattern: state construction is possible everywhere, but costs the most in free markets, where it's done through public-private partnerships (section 8.3).
- **Free market in practice:** to get mechs built, a free-market government offers a **defense contract**. Corporations bid, negotiate the price, and build the factories themselves if the contract is worth it. Higher prices mean more money spent but faster expansion. Cheap contracts may get no takers.
- **Command economy in practice:** the government sets **production quotas** and assigns factories directly. There's full control and no negotiation, but **lower efficiency**, slower innovation, and shortages if planning is wrong.
- **Tradeoffs [DEFAULT]:**
  - **Market economies:** higher efficiency, growth and innovation; less direct control; procurement costs money and negotiation.
  - **State-led economies:** more control and faster redirection to the war effort; lower efficiency; corruption risk.
- **Changing the economic system** is a major reform: it costs political capital, needs interest group support, and upsets the groups who lose out. Nationalizing industry under free-market capitalism is possible, but corporations and owners strongly resist it.
- **Corporate economic systems [DEFAULT]** (used by corporate governments, and possible for others through reform):

| Corporate economic system | Who owns industry | How the government gets what it needs | Notes |
|---|---|---|---|
| **Corporatism** | Corporations organized into **sector cartels** that coordinate with the state | Negotiates with each sector's cartel | Stable prices; little competition; slow innovation |
| **Market oligarchy** | A **few giant corporations** own most of the economy | Buys from them; they set the terms | Powerful corporations; high inequality; strong lobbying |
| **Company monopoly** | **One corporation** owns all industry (goes with the company state) | Directly, because the company *is* the state | Like a command economy run for profit |
| **Shareholder economy** | Corporations owned by citizen-shareholders; dividends instead of wages for many | Buys on the market | High public support while profits flow; unrest when they don't |

- **State-owned enterprises** work like buildings the government controls directly. They don't negotiate, but they're less efficient and still need workers, inputs and money.

### 8.14 Ideologies, Interest Groups and Political Movements (Victoria 3-style)
Politics work like **Victoria 3**: **pops** support **interest groups**, interest groups and **characters** have **ideologies**, and ideologies decide which **laws**, **government types** and **economic systems** everyone supports.

#### Ideologies
- Every ideology has a **stance on each law level, government type and economic system**: strongly approve, approve, neutral, disapprove or strongly disapprove. It also has stances on key issues (refugees, the UN, nukes, corporations, the Swarm war).
- **Ideologies [DEFAULT; names and stances to be finalized]:**

| Ideology | Broadly supports |
|---|---|
| **Liberal** | Democracy, free markets, civil rights, moderate migration |
| **Conservative** | Order, tradition, gradual change, a strong military |
| **Social democrat** | Democracy, mixed economy, welfare, labor rights |
| **Socialist** | Worker ownership, state-led economies, strong welfare |
| **Communist** | Command economy, one-party state |
| **Libertarian** | Minimal state, free markets, low taxes, open borders |
| **Nationalist** | National interest first, closed migration, strong military, skeptical of the UN |
| **Authoritarian** | A strong state, order, emergency powers, state-controlled press |
| **Militarist** | Military priority, high conscription, juntas acceptable |
| **Corporatist** | Corporate government types and corporate economic systems (sections 8.12–8.13) |
| **Technocrat** | Rule by experts, research spending, the technocratic consortium |
| **Environmentalist** | Limits on pollution, heavy disruption and nukes; cleanup |
| **Pacifist** | Against human wars and nukes; pro-UN |
| **Internationalist** | A strong UN, accepting refugees, global cooperation |
| **Isolationist** | Avoiding alliances and foreign commitments; closed borders |
| **Humanity First** *(Swarm-era)* | Global unity against the Swarm, whatever the cost: emergency powers, total war economy, sharing everything |
| **Xeno-Contact** *(Swarm-era, rare)* | Peaceful contact with the aliens; opposes the war. Mostly a pre-landfall force, a tiny cult afterwards (section 7) |

#### Pops and ideology
- **Every pop has its own ideology mix** (for example, a province's laborers might be 40% socialist, 30% nationalist, 20% conservative, 10% other).
- **What shifts pop ideology:** standard of living, unemployment, wages, taxes, the war going well or badly, distance to the Swarm, refugees, pollution, the press law and media budget, influence campaigns (including foreign ones, section 6.3), events, and charismatic characters.
- **Swarm-era shifts:** landfall pushes many pops toward Humanity First, Nationalist or Militarist ideologies; long wars, pollution and nukes push others toward Pacifist or Environmentalist.
- **Pop ideology decides which interest groups pops support**, and so how much clout each group has.

#### Interest groups
- **Interest groups [DEFAULT]:** Corporate Lobby, Armed Forces, Labor Unions, Rural & Farmers, Academia & Scientists, Civil Service, Security Services, Civic Movement (humanitarian and environmental), Nationalist Movement.
- **Each interest group has:**
  - **Base ideologies** (for example, Armed Forces: militarist and conservative)
  - A **leader** (a character, section 4.7) whose own **ideology** adds to or changes the group's stances. A new leader can shift a whole group.
  - **Clout:** its share of political power, from the size and wealth of the pops supporting it, and from the government type (armed forces clout is high in a junta, corporate lobby clout is high in a corporate state)
  - **Approval** of the government (angry → unhappy → neutral → content → happy), based on whether the laws, government and economic system match its stances, and on whether it's in government
- **Government:** the player chooses which interest groups are **in government**. Groups in government give **legitimacy** in proportion to their clout. Low legitimacy means less political capital and slower law changes. Leaving powerful groups out makes them angry.
- **Angry groups** radicalize their supporting pops (lower stability, protests, strikes). Very angry, powerful groups may attempt a **coup** (section 6.3) or back a **revolution**. **Happy groups** give bonuses in their area (Armed Forces: training and morale; Academia: research; Corporate Lobby: investment).

#### Enacting laws
- When the player starts enacting a law, every interest group takes a position (support, neutral, oppose) based on its ideology stances.
- The law then progresses over time. Each check can **advance** it, **stall** it, or cause a **setback**, with chances based on the clout of supporters vs opponents. Strong opposition can make the law **fail**.
- **Events** fire during enactment: deals with groups, concessions, protests, scandals. Concessions can buy support (for example, promising the Armed Forces a bigger budget).
- In **democracies**, support is counted through **parties** (coalitions of interest groups) and their seats.

#### Political movements
- When enough pops want a change (a law, a different government type, a different economic system, or a change of policy like "nuke the hive" or "end the war with our neighbor"), a **political movement** forms.
- Movements grow in **support** and **radicalism**. Ignored radical movements lead to protests, strikes, **revolution** (a civil war, section 6.2) or a coup.
- Movements give the player a choice: **give in** (enact what they want), **compromise**, or **suppress** them (security forces, emergency powers, press control), which costs legitimacy and may attract UN attention (section 6.4).

#### Characters and ideology
- **Every character has one ideology** (section 4.7). It decides which laws, government types and economic systems they support.
  - **Heads of state** set the government's agenda according to their ideology.
  - **Ministers** push for laws their ideology supports, and resist the rest.
  - **Interest group leaders** shape their whole group's stances.
  - **CEOs** steer their corporations' lobbying (a corporatist CEO is a takeover risk, section 8.12).
  - **Lead scientists** usually lean technocrat or internationalist, and may object to some research (weaponizing bug biology).
- Characters rarely **change ideology**, but events can cause it (a pacifist minister turning militarist after their city is overrun).

#### Ideology in other systems
- **Public opinion stances** (Denial, Prepare, Contact, Panic; section 7) are separate from ideology but linked: some ideologies lean toward certain stances (Xeno-Contact toward Contact, Militarist toward Prepare).
- **Espionage** (section 6.3) can spread an ideology in another country, back an interest group, or turn a leader.
- **AI countries** use the same system, so their policies follow their own politics.
