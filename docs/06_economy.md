# Terra Scutum Design: Population and pops

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 8. Running the Country

**Keeping your country running is half the game.** The war against the Swarm
is only as strong as the economy, food supply, industry and people behind it.
Every system below feeds into the others. Losing a province to the bugs isn't just
a map change: it takes away farmland, factories, workers and tax income, and it
sends refugees who need food and housing. Every country, including AI ones, runs
on this same model.

**Economy depth: Victoria-style, but simplified.** Population groups with jobs, wages and needs, and goods with market prices driven by supply and demand. To keep it manageable, there are **no cultures or religions**, only a short list of **population groups** and a **manageable set of goods** (about 30), enough for the production chains in section 8.3.

### 8.1 Population
- Each province tracks **population**, split into: children/elderly (consume, don't work), **workforce**, **conscripted** (in the military) and **refugees** (arrived, not yet integrated).
- **Population groups (pops) [DEFAULT]:** the workforce in each province is split into groups by job:

| Group | Works in | Notes |
|---|---|---|
| Laborers | Farms, mines, factories | Biggest group; low wages |
| Skilled workers | Factories, power plants, shipyards | Needed for advanced buildings (mechs, spaceports) |
| Professionals | Offices, labs, universities | Needed for research and services; slow to train |
| Owners / capitalists | Corporations | Invest, and are hit hardest by nationalization |
| Officials | Government | Run administration and policing |
| Soldiers | The military | Drafted from the other groups |

- Each pop has a **size**, **wage/income**, **standard of living** (how many of its needs it can afford), its own **ideology mix** (section 8.14), and which **interest groups** it supports.
- **Needs** are bought from the market (8.6): basic (food, housing, energy), everyday (consumer goods, services) and luxury. Standard of living sets happiness.
- **Pops change jobs** when buildings open, close or pay better. Education spending and time turn laborers into skilled workers and professionals.
- The workforce is assigned to **sectors** (8.3). People who aren't employed count as **unemployed**, which lowers stability.
- **Needs:** food, consumer goods, energy, safety. Unmet needs lower **happiness**, which feeds into stability.
- **Growth:** births minus deaths. Deaths rise with famine, war casualties, Swarm attacks and fallout.
- **Casualties are real.** Soldiers killed and civilians lost come out of the population permanently.

#### How the population model works (built in F06) [DEFAULT]
All numbers are in `data/pops.json` unless said otherwise; the starting figures are real (2025).
- **Starting population:** each country's population (World Bank) is shared among its provinces by where people really live (a world population grid, `data/province_start.json`). Each province's people are split into **dependents** (children, the elderly and others who don't work) and the **workforce** (the country's real labor force share); the workforce into the six pop groups: **soldiers** by the country's real armed forces, the others by how rich the country is (GDP per person): poorer countries are mostly laborers, richer ones have more skilled workers and professionals.
- **Growth (daily):** births and deaths at the country's real rates (a dependent is 4× likelier to die than a worker); each day some dependents enter the workforce and some workers retire after about 45 working years. New workers join the pop groups in the proportions the province has now. There is no migration between provinces or countries yet (F108).
- **Jobs:** each pop has a number of jobs; people without one are **unemployed**. Until buildings offer the jobs (F07), a stand-in economy does: it starts at the country's real unemployment rate and keeps pace with the workforce. Owners and soldiers are never unemployed.
- **Changing jobs (weekly):** people move to another pop group when it has open jobs and they are unemployed or would earn more. Moving **down** (a professional or official taking skilled work, a skilled worker taking laborer work) is quick (up to 5 % of the group a week); moving **up** needs training and is slow (laborers → skilled workers 0.4 % a week, skilled workers → professionals 0.2 %, professionals or skilled workers → officials). The education budget will speed training up (F09). Nobody becomes an owner or a soldier this way (corporations, F89; conscription, F15).
- **Wages:** paid per worker; a worker's wage also feeds the dependents. Until buildings pay wages (F07): a country's pops earn 60 % of its real GDP between them, with skilled workers paid 1.6×, officials 1.8×, professionals 2.6×, owners 6× and soldiers 1.2× a laborer's wage.
- **Needs** in three tiers, bought in order: **basic** (food, housing, energy), **everyday** (consumer goods, services), **luxury** (luxury goods). Each has a cost per person per day. Until markets set prices (F65), a province's prices follow how rich its country is (poorer countries are cheaper). *Safety*, the fourth need of this section, isn't bought: it comes with the Swarm (distance to the front, F10 and M7).
- **Standard of living** (0–100): 40 for basic needs fully met, 35 more for everyday needs, 25 more for luxuries; in proportion when a tier is only partly affordable. It feeds happiness and stability (F10) and pop ideology (F118).
- **Casualties** remove people for good (from one pop, or from everyone in a province); wars, the Swarm, famine and fallout will use this.
- **Not in F06:** refugees (F33), conscription (F15), ideology mixes and interest groups (F118, F119), famine deaths (F08), welfare for the unemployed (F09).

### 8.2 Economy and Budget
- **GDP** is the total output of all sectors.
- **Revenue** = GDP × tax rate. Higher taxes lower happiness and business confidence.
- **Treasury** (money) is spent through a **budget** the player sets as percentages:

| Budget line | What it does |
|---|---|
| Military | Upkeep for divisions and equipment; procurement |
| Research | Converts to research points |
| Social / welfare | Supports happiness, unemployment relief, health |
| Infrastructure | Builds and repairs roads, rail, power grids; affects supply and evacuation |
| Refugee services | Camps and integration |
| Environment | Heavy-metal cleanup, fallout cleanup |
| Influence / media | Converts to Influence |
| Intelligence | Builds intelligence networks abroad, counter-intelligence at home (section 6.3) |
| Subsidies | Support for chosen sectors or businesses |

- **Debt:** the country can borrow (bonds) when the treasury runs low. Debt has interest, and too much debt lowers the credit rating, which raises interest and eventually triggers a financial crisis.
- **Printing money** is an emergency option. It causes **inflation**, which lowers happiness and makes everything cost more.
- **Economy mode law** (see 8.8) sets how the economy balances civilian and military needs.

### 8.3 Buildings and Production Chains (Factorio-style)
**Supplying the country and the army means building production chains.** Raw
materials have to be extracted, processed into intermediate goods, and assembled
into final products, with each step in its own building. Like Factorio, the
player sets up **chains of buildings**, balances their **ratios**, and fixes
**bottlenecks**. Unlike Factorio, it plays out at country scale: buildings sit
in provinces, and goods move over the transport network.

#### How buildings work
- Each province has **building slots**, set by its size, terrain and infrastructure. Some buildings need a **deposit** (ore, oil) or **farmland**, or have to be **coastal** (ports, shipyards).
- Every production building has a **recipe**: **inputs per day → outputs per day**, plus **workers** (by pop group, section 8.1) and **electricity**.
- **Levels:** buildings can be expanded (more levels mean more output, workers and inputs).
- **Production methods [DEFAULT, Victoria-style]:** some buildings have alternative recipes. For example, a steel mill can run a blast furnace (iron ore + coal) or an electric arc furnace (scrap + lots of electricity). Better methods are unlocked by research.
- **Missing inputs:** a building that can't get all its inputs runs at partial output. If it has no electricity or workers, it stops.
- **Who builds:** both the state and corporations. See **Private vs state construction** below.

#### Example production chains [DEFAULT]
```
Iron mine ─┐
           ├─► Steel mill ─► Steel ─┬─► Machine parts plant ─► Machine parts ─┐
Coal mine ─┘                        │                                        │
                                    └─────────────────────────────┐          │
Rare metals mine ─► Rare metals ─┬─► Electronics plant ─► Electronics ─┐     │
Chemical plant ─► Chemicals ─────┘                                     │     │
                                                                       ▼     ▼
                                     Mech parts factory (steel + electronics + machine parts + rare metals) ─► Mech parts
                                                                       │
                                     Mech assembly plant (mech parts + electronics + electricity) ─► Mech Walkers

Oil well ─► Oil refinery ─┬─► Fuel ──────────────► Supply depots, vehicles, power plants
                          └─► Chemicals ─┬─► Explosives ─┐
Steel ───────────────────────────────────┼───────────────┴─► Ammunition plant ─► Ammunition
Heavy-metal mine ─► Heavy-metal refinery ─► Heavy metals ─► Disruptor round plant (+ steel + explosives) ─► Disruptor rounds

Farm ─► Grain ─► Food processing plant ─┬─► Processed food (civilians)
                                        └─► Rations (army)
```

#### Building catalog [DEFAULT; full stats to be written, section 17]
| Category | Buildings |
|---|---|
| **Extraction** | Farm, ranch, fishery, iron mine, coal mine, oil well, gas field, rare metals mine, heavy-metal mine, quarry |
| **Energy** | Coal, gas, nuclear and hydro power plants; solar and wind farms; **substation** |
| **Processing** | Steel mill, oil refinery, chemical plant, heavy-metal refinery, food processing plant, construction materials plant, explosives plant |
| **Manufacturing (civilian)** | Consumer goods factory, luxury goods factory, electronics plant, machine parts plant |
| **Manufacturing (military)** | Small arms factory, **ammunition plant**, **disruptor round plant**, vehicle factory, artillery works, aircraft factory, missile plant, **mech parts factory**, **mech assembly plant**, shipyard (coastal), launch vehicle plant |
| **Research** | University, **research center**, military research lab, state research institute, Xeno Lab, containment facility, cold storage |
| **Logistics** | Rail hub, supply depot, fuel depot, warehouse, port (coastal), airfield |
| **Military** | Training camp, pilot academy, military base, naval base (coastal), fortifications, seismic sensor station, air defense site |
| **Civil** | Housing, hospital, school, refugee camp, government administration, police station |
| **Space** | Spaceport, satellite control center |

#### Private vs state construction
Construction works like research (section 11.4): **private construction is free but uncontrolled; state construction is controlled but paid for**, and how expensive it is depends on the economic system.

| | **Private construction** | **State construction** |
|---|---|---|
| Who builds | **Corporations**, using their own money and construction capacity | **The government** |
| Who pays | The corporation (free for the government) | The government |
| Who decides what gets built | **The corporation**, based on what's profitable (shortages, high prices, demand) | **The government, directly**: exact building, province and level |
| How the government steers it | **Government contracts** to build specific things; subsidies and tax breaks to make sectors or provinces more attractive | Direct orders |

- **State construction is possible in every economic system,** but its cost differs **[DEFAULT]**:

| Economic system | How state construction works | Cost |
|---|---|---|
| **Free-market capitalism** | Through **public-private partnerships**: the state pays a corporation to build and may share ownership | **Most expensive** (about 150%) |
| **Mixed economy** | Partnerships plus state-owned builders | Higher (about 125%) |
| **State capitalism** | State-owned builders, plus directing private ones | Normal (100%) |
| **Command economy** | State builders only; **all** construction is state construction | Normal (100%) |

- **Government contracts:** the government offers a contract to build something specific ("3 levels of ammunition plants in Ohio"). Corporations bid. The winner builds it, and the building is **privately owned** and sells its output on the market (or to the government under the contract terms). This is usually cheaper than state construction in market economies, but slower to arrange and depends on corporations taking the deal.
- **Private construction on its own:** corporations build whatever looks profitable. In a war economy with high ammo prices, they'll build ammo plants without being asked. They won't build things that don't pay, like fortifications, refugee camps or infrastructure in dangerous provinces. That's what state construction and contracts are for.
- **Ownership matters:** privately owned buildings are run by corporations (they set wages and can close unprofitable buildings). State-owned buildings are run by the government (it covers losses, and it can keep them running at a loss for the war effort).

#### Location and transport
- **Goods move over the transport network.** A building's output enters the national market (8.6) or stockpile, but each province can only ship out as much as its **transport capacity** (rail, roads, ports) allows.
- **Transport costs:** inputs that come from far away cost more and arrive slower. Building connected steps **close together** (in the same or neighboring provinces) is cheaper.
- **Industrial clusters [DEFAULT]:** a province with several linked buildings gets an efficiency bonus. Steel mills near mines and power, and mech plants near electronics and steel, are good examples.
- **Risk:** clusters near the front are efficient, but one Swarm breakthrough or blackout can take out a whole chain. Spreading industry out is safer but slower.

#### Seeing the chains
- **Production chain view:** a flow diagram of every good (where it's made, where it's used, and how much per day), with **bottlenecks highlighted in red**.
- **Build suggestions:** when a good is short, the screen shows which building is missing and how many levels would close the gap ("you need 2 more steel mills to supply your mech plants").
- **Map overlays** for each good: production, consumption and shortages by province.
- **Alerts:** "Ammunition plant in Ohio at 40%: missing explosives."

#### Other rules
- **Construction:** **construction materials** plus construction capacity are spent on building or upgrading buildings, fortifications and infrastructure.
- **Converting** a factory to a different recipe or product takes time and money.
- **Relocating industry** away from the front is possible but slow and expensive, and it's a key decision as the Swarm approaches.
- **Damage:** fighting in a province damages buildings. Swarm-controlled provinces lose all their buildings. Destroyed links break every chain that depends on them.

### 8.4 Businesses (Private Sector)
- **Business confidence** (0–100) affects investment, GDP growth and how fast new buildings get built.
- Confidence drops with high taxes, Panic, nationalization, instability and Swarm proximity. Very low confidence causes **capital flight**: money and companies leave for safer countries.
- **Corporations are independent actors.** They're **fictional** companies, and the government doesn't control them directly. **How much influence each side has depends on the country's economic system** (section 8.13). Command economies have no corporations at all.
  - **How many:** the number of corporations a country has scales with the **size of its economy** and its **economic system**: a big economy has many, a small country may have one or two. New corporations can form as the economy grows. Weak ones can go bankrupt, merge, or be bought by foreign corporations.
  - **Sectors:** defense, agriculture, energy, mining, manufacturing, tech, logistics, finance.
  - **They make their own decisions:** where to invest, which buildings to build or expand, what prices and wages to set, whether to move operations abroad, and which policies to lobby for. Their goal is profit and survival, not the war effort.
  - **Each corporation is a fully simulated entity** with its own money, assets, workforce, stability and public opinion (section 8.4.1).
  - **They can act against the government:** lobbying against taxes or nationalization (it shifts political support and can block law changes), moving factories and money abroad when things look bad, cutting production when it's unprofitable, or lobbying for war contracts.
  - **They can help:** offering deals ("Fund our project and we'll deliver a prototype mech frame"), building facilities on their own, investing in safe provinces, and **doing research** for the country (section 11.4). That makes them worth keeping.
  - **Multinationals** operate in several countries, which links economies together and creates diplomatic leverage.
- **Government influence tools** (the government influences corporations; it doesn't command them):
  - **Defense contracts**: pay a corporation to boost military production or develop equipment
  - **Subsidies**: support a sector or company
  - **Regulation / deregulation**: tradeoffs between stability, growth and control
  - **Nationalization**: direct control and priority for the war effort; the state takes on the corporation's costs and loses its free research and construction (sections 8.3, 11.4); confidence drops sharply
  - **Bailouts**: rescue a failing corporation (section 8.4.1)

#### 8.4.1 Corporation model
Corporations are simulated like small countries inside the economy. They update **weekly [DEFAULT]**.

| Attribute | What it tracks | What it affects |
|---|---|---|
| **Money (treasury)** | Cash on hand, revenue, costs, profit or loss each week | Whether it can invest, build, do research, pay wages and survive |
| **Debt and credit** | Loans from banks (finance corporations) and bonds; a credit rating | Borrowing to expand or survive; too much debt leads to bankruptcy |
| **Assets** | **Buildings it owns** (in one or more provinces and countries), stockpiled goods, and its research projects and products | Production, revenue, value; assets in lost provinces are destroyed |
| **Workforce** | Employees by pop group (section 8.1), wages, hiring and layoffs | Whether its buildings can run; labor costs; unemployment when it fires people |
| **Stability** (0–100) | Internal health: management, labor relations, employee morale | Low stability causes **strikes**, lower productivity, leadership crises, and makes bankruptcy more likely |
| **Public opinion** (reputation, -100 to +100) | How the public sees it: patriotic hero or war profiteer | Sales of consumer goods, lobbying power, and how popular a bailout or nationalization would be |
| **Traits** | Cautious, aggressive, innovative, patriotic, multinational | Its decisions: risk-taking, research, relocating abroad |
| **Attitude toward the government** (-100 to +100) | Relationship with the government | Willingness to take contracts, cooperate, or lobby against the government |

- **Money flow:** income comes from selling goods on the market, government contracts and grants. Costs are wages, inputs, upkeep, debt interest, research and construction. Profit goes into its treasury, new buildings, research, or payouts to owners (the owner pop group, section 8.1).
- **Workforce:** corporations hire from the province's pops and compete for skilled workers and professionals. Conscription (8.7) shrinks their workforce. When they're losing money, they **lay off** workers, which raises unemployment.
- **Stability events:** strikes over wages, accidents, management scandals, a key factory destroyed, a hostile takeover attempt.
- **Public opinion events:** war profiteering (high prices during shortages), pollution, patriotic donations, heroic production records, a product failure at the front.
- **Owning buildings:** every building is owned by a corporation or by the state (section 8.3). A corporation's buildings in a province overrun by the Swarm are **lost**. That can bankrupt a company concentrated near the front.

#### 8.4.2 Bankruptcy
- A corporation goes **bankrupt** when it can't pay its debts or wages and can't borrow more.
- **When it happens, the government gets a decision [DEFAULT]:**

| Option | What happens |
|---|---|
| **Bailout** | The government pays off the debt, with conditions (a share of ownership, a production commitment, keeping workers employed). It costs money and is unpopular if the corporation has a bad reputation |
| **Let it be sold** | Other corporations, **including foreign ones**, buy its buildings. Foreign buyers mean less control and diplomatic leverage for them |
| **Nationalize** | The state takes over its buildings and workers. They become state-owned, and the state pays for them from now on |
| **Let it fail (liquidation)** | Buildings are closed or sold off cheaply, workers lose their jobs (unemployment, stability drop), its research is lost, and production chains that depended on it break |

- **"Too big to fail":** if a big corporation goes under, the knock-on effect can hit whole production chains, the country's stability and business confidence. That makes bailouts tempting, even though they're expensive.
- **Mergers and acquisitions:** healthy corporations can buy struggling ones or merge, sometimes across borders. The government can block mergers (regulation), at a cost to business confidence.
- **New corporations** form when there's demand and investment (high business confidence, profitable sectors with no big players).

### 8.5 Food
- **Production** comes from farms. Output depends on terrain, **season**, weather, **pollution** (section 5.4.2) and technology.
- **Consumption** = population × food per person. Soldiers and refugees eat too.
- **Food reserves** act as a stockpile with a storage limit.
- **Shortages** lead first to price rises and unhappiness, then rationing, then **famine**: population loss, riots and a big stability drop.
- **Imports and exports** happen through trade (8.6).
- **Rationing law** (8.8) lowers consumption at a happiness cost.
- **Swarm threat to food:** losing farmland provinces and seeing refugee numbers jump can push a country into famine even far from the front.

### 8.6 Resources and Trade
- **Strategic resources:** steel, oil, rare metals (mechs, spaceports), **heavy metals** (disruptor rounds), energy, food, consumer goods, equipment.
- Each country has a **stockpile** of each resource. Shortages slow down any building that needs that resource.
- **Trade agreements** with other countries: buy or sell resources for money, or swap one resource for another. They need decent relations.
- **Trade routes** run through provinces and **sea zones**. If the Swarm takes or contests a province on the route, trade through it is disrupted.
- **Embargoes and sanctions** (section 6) cut off trade.
- During the war, **global markets** tighten: prices rise as producing countries fall.

#### Goods and markets (simplified Victoria)
- **Goods [DEFAULT, about 30]:**
  - **Raw:** grain, livestock/fish, iron ore, coal, oil, natural gas, rare metals, heavy metals, stone
  - **Intermediate:** steel, fuel, chemicals, explosives, electronics, machine parts, construction materials, electricity
  - **Civilian:** processed food, consumer goods, luxury goods, services
  - **Military:** rations, small arms, ammunition, disruptor rounds, vehicles, artillery, aircraft, missiles, mech parts, mech walkers, launch vehicles
- Each country has **one national market**. Buildings sell what they produce there and buy their inputs there. Pops buy their needs there. The government buys military goods there.
- **Prices** move with **supply and demand**. Shortages push prices up, which hurts pops' standard of living and raises building costs. Surpluses push prices down, which hurts producers' profits.
- **Building profitability:** buildings pay wages and buy inputs at market prices. Unprofitable buildings lay off workers or close, unless they're subsidized or nationalized.
- **International trade** connects national markets through trade agreements and routes. Goods flow toward higher prices, minus transport costs and tariffs.
- **Simplifications:** no detailed shipping, and prices (and corporation decisions) update **weekly**, not daily.

### 8.7 Military and Manpower
- **Manpower** = the share of the workforce that the **conscription law** (8.8) allows the military to draft. Drafting people takes them out of the workforce, so the economy produces less.
- **Equipment** is produced by the military production chains (section 8.3) into a national stockpile. Divisions need **manpower + equipment** to be created and to replace losses.
- **Training time:** new divisions take time to become ready. Rushing training produces weaker units.
- **Pilots are their own manpower pool.** Mech, aircraft and space pilots can't be drafted like regular soldiers:
  - **Pilot academies** (a building) turn suitable recruits into pilots. Each academy has a training capacity and takes months per pilot **[DEFAULT: mech pilots ~6 months, aircraft ~9, space ~12]**.
  - Recruits come from the general manpower pool, with a preference for skilled workers and professionals (section 8.1), so they compete with industry.
  - Pilots specialize: **mech, aircraft or space** **[DEFAULT]**. Switching takes retraining.
  - **Rushed training** produces pilots faster but with lower skill and higher losses.
  - **Aces** (section 5.3) assigned as instructors at an academy improve training quality.
  - Pilot losses are the real bottleneck for elite units: a mech battalion with no pilots can't fight, however many mechs are in the stockpile.
- **Upkeep:** every division costs money and supplies (food, fuel, ammo) every day.
- **Military units** are listed in 8.11.

### 8.8 Laws and Policies
Each law has several levels. Changing a law takes time, costs Influence or stability, and may be blocked by public opinion (section 7).

| Law | Levels (example) | Tradeoff |
|---|---|---|
| Economy mode | Civilian → Early mobilization → Partial mobilization → War economy → Total war | More military output and construction for war; less consumer goods, lower happiness |
| Conscription | Volunteer → Limited → Extensive → Universal → All adults | More manpower; smaller workforce |
| Rationing | None → Light → Strict → Emergency | Less food and goods consumed; lower happiness |
| Trade | Free trade → Export focus → Limited exports → Closed | Income and imports vs keeping resources at home |
| Press / media | Free → Guided → State-controlled | More Influence at home; foreign relations and opinion shift |
| Emergency powers | None → Martial law in threatened provinces → National martial law | Faster decisions and order; less happiness; relations penalty |
| **Migration** | Closed → Restricted → Skilled workers only → Open | Controls **peacetime migration**: people moving in for jobs and a better life. Open borders bring workers and growth but can strain stability; closed borders stop inflow and outflow. Brain drain: skilled people leave countries with poor conditions if the other country's law lets them in. Separate from the refugee border policy (section 9) |
| Refugee policy | Set per province (section 9) | |

### 8.9 Stability and Unrest
- Each country (and each province) has **stability** (0–100). It's calculated from food, employment, consumer goods, safety (distance to the Swarm), happiness, refugees, public opinion and laws.
- **Effects:** stability multiplies production. Low stability causes **strikes** (factories stop), **protests**, **riots** (building damage) and eventually **government collapse**, which loses the game if it's the player's country.
- **Events** fire at stability thresholds, often with a choice ("Workers demand higher wages: accept / refuse / send police").

### 8.10 Other national resources
| Resource | Source | Spent on |
|---|---|---|
| **Research points** (per day) | **State research** (paid upkeep, directly controlled), **private corporate research** (free, steered with grants), universities, shared research | Split between **global techs** and **country projects** (section 11) |
| **Influence** (per day) | Media budget, press law, stability, relations | Influence actions, law changes, some diplomacy |
| **Specimens** (items) | Corpses from battles, live captures, hive expeditions, captured structures, trades | Experiments in Xeno Labs (section 11.1) |

### 8.11 Units (starting roster; more are unlocked by research)
See section 5.4 for how the domains work together.

| Unit | Domain | Role | Notes |
|---|---|---|---|
| Infantry Division | Land | Hold ground | Cheap, uses a lot of manpower; weak in the open against hordes |
| Armored Division | Land | Defense lines, breakthroughs | Strong against Swarmers; weak to acid |
| Artillery Division | Land | Fire support, **disruptor barrages** | Normal shells are intercepted by lasers; disruptor rounds create the heavy-metal cloud |
| Mech Walker battalion *(research; only after landfall)* | Land | **Elite spearhead** | Player-designed (5.4.9); expensive; low jumps under laser fire; hunts Interceptors; needs pilots and resupply |
| Engineer / Rocket Artillery battalion | Land | Fortifications, mines, massed fire | Conventional backbone |
| Battleship / Gun Cruiser | Sea | Coastal bombardment, disruptor barrages | Coastal and adjacent provinces |
| Missile Ship | Sea | Precision strikes | Only effective where lasers are disrupted or cleared |
| Mech Carrier | Sea | Launch mechs for amphibious assaults | |
| Transport / Escort / Submarine | Sea | Movement, amphibious landings, trade protection | |
| Air Wing | Air | Strike / recon / transport | Shot down in laser coverage; devastating once lasers are cleared |
| Satellite | Space | Surface recon, communications, early warning | |
| Orbital Bombardment Platform | Space | Strikes from orbit; a source of disruption | Intercepted like any projectile |
| Orbital Drop Division *(research)* | Space → Land | Elite mechs dropped onto hives | Heavy losses during descent unless the province is disrupted |
| Seismic Sensor Net (structure) | — | Detection | Reveals tunnels and infestation in this province and adjacent ones |
| Nuclear Strike (if capable) | — | Last resort | See section 6.1; missiles and bombers are intercepted by lasers like any airborne weapon |
