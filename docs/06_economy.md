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

**Victoria 3 is the foundation for every economy and pop decision** (designer decision, 2026-11-17): markets and prices, pops, needs and wealth, wages, employment, buildings and their profits, and later the budget, laws, interest groups and politics follow Victoria 3's rules, except where this design deliberately differs (no cultures or religions, six pop groups, real units, the national stockpile, fully simulated corporations…). Where it differs, the design says so.

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
- **Needs** are bought from the market (8.6): basic food, heating, consumer goods, better food, transport, communication, housing, services and luxuries, more of them the wealthier a pop is (F65, Victoria 3's buy packages). Standard of living sets happiness.
- **Pops change jobs** when buildings open, close or pay better. Education spending and time turn laborers into skilled workers and professionals.
- The workforce is assigned to **sectors** (8.3). People who aren't employed count as **unemployed**, which lowers stability.
- **Needs:** food, consumer goods, energy, safety. Unmet needs lower **happiness**, which feeds into stability.
- **Growth:** births minus deaths. Deaths rise with famine, war casualties, Swarm attacks and fallout.
- **Casualties are real.** Soldiers killed and civilians lost come out of the population permanently.

#### How the population model works (built in F06) [DEFAULT]
All numbers are in `data/pops.json` unless said otherwise; the starting figures are real (2025).
- **Starting population:** each country's population (World Bank) is shared among its provinces by where people really live (a world population grid, `data/province_start.json`). Each province's people are split into **dependents** (children, the elderly and others who don't work) and the **workforce** (the country's real labor force share); the workforce into the six pop groups: **soldiers** by the country's real armed forces, the others by how rich the country is (GDP per person): poorer countries are mostly laborers, richer ones have more skilled workers and professionals.
- **Growth (daily):** births and deaths at the country's real rates (a dependent is 4× likelier to die than a worker); each day some dependents enter the workforce and some workers retire after about 45 working years. New workers join the pop groups in the proportions the province has now. There is no migration between provinces or countries yet (F108).
- **Jobs:** each pop has a number of jobs; people without one are **unemployed**. The jobs come from **buildings** (F07, section 8.3) and from a **stand-in economy** for everything the building catalog doesn't cover yet ("the rest of the economy"): at the start it offers the jobs the starting buildings don't, so every country starts at its real unemployment rate; after that it keeps pace with the workforce, while a building that opens or closes changes employment. Owners and soldiers are never unemployed.
- **Changing jobs (weekly):** people move to another pop group when it has open jobs and they are unemployed or would earn more. Moving **down** (a professional or official taking skilled work, a skilled worker taking laborer work) is quick (up to 5 % of the group a week); moving **up** needs training and is slow (laborers → skilled workers 0.4 % a week, skilled workers → professionals 0.2 %, professionals or skilled workers → officials). The education budget speeds training up or slows it down (F09: ×0.5 to ×1.5, section 8.2). Nobody becomes an owner or a soldier this way (corporations, F89; conscription, F15).
- **Wages:** paid per worker; a worker's wage also feeds the dependents. A country's pops earn 60 % of its real GDP between them, with skilled workers paid 1.6×, officials 1.8×, professionals 2.6×, owners 6× and soldiers 1.2× a laborer's wage. This is the **going local wage**, which the rest of the economy pays. Since F65 each building pays it × its own **wage level**, which follows its profit (section 8.6), a subsistence building's workers share what it makes, and owners also get the **dividends** of their province's buildings.
- **Needs and wealth (F65, Victoria 3; replaced F06's three tiers):** every pop has a **wealth** from 1 to 99. Each wealth level has a **buy package**: what a worker spends a day on each need, in US$ at base prices (a dependent counts as half a worker); richer levels buy more, and more services and luxuries. The needs: **basic food** (grain, livestock and fish, processed food), **heating** (electricity, fuel, coal, natural gas), **consumer goods**, **better food** (livestock and fish, processed food), **transport** (fuel), **communication** (electronics), and **housing**, **services** and **luxuries**, which have no good yet and are paid at F06's stand-in price (how rich the country is: they are local work). A need with several goods is split among them by what is on sale (**substitution**, section 8.6). Pops buy their package every day on their country's market. **Wealth moves weekly:** up while the pop's income is above 102 % of the next level's package (by a fifth of the gap to what it can afford), down while below 98 % of its own (by a tenth of the gap). At the start each pop's wealth is what its income buys. *Safety*, the fourth need of this section, isn't bought: it comes with the Swarm (distance to the front, F10 and M7).
- **Standard of living** (1–99): the pop's wealth, less up to 10 when its goods went undelivered last week (in proportion to the share missing), and (F08) less what starvation (up to 5 mild, 15 severe) and rationing (1–6) take, and (F09) less what inflation (up to 10) and a default (5 for a year) take. Since F09 wealth follows a pop's income **after taxes** plus benefits (section 8.2). Each pop also has an **expected standard of living**: its starting wealth less 5 (a stand-in for Victoria 3's expectations by stratum and literacy, until F10 and F118). It feeds happiness and stability (F10) and pop ideology (F118). At the start the standard of living is close to F06's: the United States 91 (F06: 92), Germany 88 (89), China 73 (79), India 58 (59), Nigeria 53 (50), Burundi 46 (44).
- **Casualties** remove people for good (from one pop, or from everyone in a province); wars, the Swarm, famine and fallout will use this.
- **Starvation (F08, section 8.5):** births fall and deaths rise for pops whose food security is low; famine deaths come out of the population for good.
- **Not in F06:** refugees (F33), conscription (F15), ideology mixes and interest groups (F118, F119). *(Welfare for the unemployed and the education budget's training speed: F09, section 8.2.)*

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

#### How the budget works in the game (built in F09) [DEFAULT]
All numbers are in `data/budget.json`; each country's real 2025 revenue, spending, debt, inflation and interest rate in `data/country_start.json` (from the IMF, `packages/tools/starting-data/sources/imf-fiscal.json`). The rules are **Victoria 3's** (designer decision: Victoria 3 is the foundation) unless said otherwise. *(Victoria 3's wiki couldn't be read by the session that built this, so the rules follow Victoria 3 as the session knew it and the numbers are our own [DEFAULT]s.)*
- **The treasury** (Victoria 3's gold reserves) holds real US$; it starts with 4 weeks of the country's spending. **Every Monday** the week's income and spending are added up: a deficit comes out of the treasury, and once it is empty the country **borrows** (Victoria 3); a surplus **pays debt back** from what the treasury holds above 4 weeks of spending. *We differ:* there is no cap on the treasury (Victoria 3's gold reserve limit).
- **Every country starts with its real 2025 budget** (designer request): revenue, spending and gross debt as shares of GDP (IMF Fiscal Monitor and World Economic Outlook, October 2026; hand-written estimates for the 11 countries the IMF lacks), so the United States takes in 30.5 % of GDP and spends 37.6 % with a debt of 124 %, Germany 47 % and 50 % with 63 %, Japan's debt is 205 %. *We add:* a starting deficit is at most **10 % of GDP** (Timor-Leste really spends 89 % of GDP from its oil fund, Libya and Ukraine run 18–30 % deficits from oil money and foreign aid the game doesn't have).
- **Income (Victoria 3's taxes):** **income tax** on wages by **stratum** (laborers and soldiers lower 10 %, skilled workers, officials and professionals middle 20 %, owners upper 30 % at the medium level; subsistence farmers and herders pay none); **dividends tax** (25 %); **consumption tax** on what people buy (10 %, on top of the price; *we differ:* one rate on every good instead of Victoria 3's per-good taxes, which need politics); **tariffs** (F19's, now paid into the treasury); **other revenue**, a stand-in for what our pops don't cover yet (corporate taxes, oil and gas money: Kuwait's 42 % of GDP), sized so that each country starts with its real revenue, growing with GDP; and **printed money**. Where the pops' taxes would raise more than 85 % of a country's real revenue, it **collects** less (informal work, evasion).
- **The tax level** (Victoria 3: very low, low, medium, high, very high) multiplies every tax and the other revenue (×0.5, ×0.75, ×1, ×1.25, ×1.5). A country starts at the level its real revenue fits (below 15 % of GDP very low … above 45 % very high).
- **What taxes do to people (Victoria 3):** a pop's wealth follows what it has left: its income less income and dividends taxes, plus unemployment benefits, ÷ (1 + the consumption tax). So the standard of living starts 1–4 points lower than before F09, most in high-tax countries (designer decision: Victoria 3's way; the expected standard of living is set from the new start, so nobody starts unhappy). The world's average went from 67.5 to about 64.8.
- **Spending, each line with a funding level** (designer decision: Victoria 3's five levels, not the design's percentages):
  - **Administration:** the government pays the **officials' wages** (Victoria 3's government wages; until F09 the stand-in rest of the economy paid them): ×0.6 to ×1.4 of the going wage; it also sets how much tax is collected (85 % at very low, 103 % at very high).
  - **Military:** the **soldiers' wages** (Victoria 3's military wages), ×0.6 to ×1.4. Upkeep, procurement and conscription come with F14 and F15.
  - **Welfare:** **unemployment benefits**: the unemployed get none, 10, 25, 40 or 60 % of the going wage. A country starts at the level of its tax level.
  - **Education** (designer decision: its own line; section 8.2's table had none): **speeds up training** for better jobs (F06's laborers → skilled workers → professionals and officials: ×0.5 to ×1.5); it costs 12 % of the country's real spending at medium (×0.5 to ×1.5).
  - **Interest** on the debt, every week.
  - **Other spending:** a stand-in for everything real governments pay for that the game doesn't have yet (health, pensions, roads, police, the military's equipment), sized so that each country starts with its real spending, growing with GDP; fixed (cutting it would be free money). Later features take their share out of it.
  - **Placeholders** (shown greyed out until their feature): research (F83), infrastructure (F128), refugee services (F33), environment (F53), influence and media (F22), intelligence (F66), subsidies (F20).
- **GDP** (a stand-in until the economy has its own): the real 2025 GDP, moving with what the country's pops earn.
- **Debt and interest:** each country starts with its **real interest rate** (interest paid ÷ debt; United States 3.2 %, Japan 0.7 %, Germany 1.7 %, Brazil 8.9 %; by GDP per person where the data has none). The **credit limit** is the starting debt plus 50 % of GDP (at least 60 %); the **credit rating** (AAA → CCC) follows how much of it is used, and **interest rises** from 70 % of it (up to +6 points at the limit; *we differ:* Victoria 3 keeps interest flat, section 8.2 raises it). Lenders also add half of any inflation above both normal and the starting inflation (real rates already carry that), up to +10 points.
- **Default** (Victoria 3: debt above the credit limit; section 8.2's "financial crisis"): **half the debt is written off**, the country **can't borrow for 2 years** (rating D), pays **+5 points of interest for 5 years**, pays only what comes in (every spending line is cut to fit, at least to a quarter; also the officials', soldiers' and unemployed's pay and education's training speed), and its people lose **5 points of standard of living for a year** (a stand-in for the unrest stability will bring, F10). The game tells every default in a toast.
- **Inflation** (section 8.2; Victoria 3 has none): starts at each country's real 2025 rate (Venezuela 252 %, Argentina 42 %, Turkey 35 %) and drifts halfway to **normal (2.5 %)** every 26 weeks. **Printing money** (none, some, lots, massive: 0, 1, 5, 15 % of GDP a year into the treasury) pushes it toward normal + 4 × the share printed. Our prices stay in 2025 dollars, so inflation shows as people's money buying less: they lose standard of living above 10 % inflation (up to 10 points at 100 %), and borrowing costs more.
- **Other countries run their budgets automatically** (like their rationing, F08): at most one step every 26 weeks, they **tighten** (taxes up, then welfare, education, the military and administration down) above 85 % of the credit limit in a deficit, or with a deficit above 3 % of GDP once they use 40 % of it; they **loosen** (back toward where they started) below 40 % with a surplus above 1 % of GDP; they print money only while they can't borrow. The player sets their own budget (designer decision: Automatic is off for the player; a button turns it on).
- **What the player sees:** the **Treasury key number** in the top bar (the treasury and last week's balance; yellow in a deficit, red near the credit limit or in default; its tooltip sums up income, spending, debt, rating, interest and inflation); the **Budget screen** (Economy lens): the treasury, balance, debt, credit limit, rating, interest, inflation and GDP (with the real 2025 revenue and spending), the balance week by week, **the tax level and each line's funding level, money printing and the automatic budget as buttons**, last week's income and spending line by line (amounts and shares of GDP; the placeholders greyed out), what each pop group pays (its income tax, income before and after taxes), the world's biggest debtors, and a **debt crisis test tool**; the **borrowing**, **near the credit limit**, **default** and **high inflation** alerts.
- **On the real world** (ten years, seed 42, the AI running every budget, the player's too): no country defaults; the world's government debt goes from about 90 % to 88 % of GDP; inflation everywhere settles at 2.5 % (Venezuela from 252 % to 2.7 % within five years); Italy ends closest to its credit limit (85 %); the world's standard of living 63.2 after ten years (65.9 before F09: taxes take about 3 points). Big countries that ran real deficits of 3–7 % of GDP (China, India, Brazil, the United Kingdom) raise their taxes a step in the first year. The United States left on manual without changes runs its real 7 % deficit and defaults around year 8.
- **Not built yet:** the budget's politics (laws on taxes and welfare, Victoria 3's tax laws and their interest groups: F16, F119); stability and happiness from taxes, unemployment, inflation and defaults (F10); the government buying goods (military goods: F14; food for the reserves: with it); state construction (F12) and the placeholder lines; corporations' own taxes and debts (F89); debt held by corporations and debt capture (section 8.12, F115); a GDP of its own (the economy's value added).

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

#### How buildings work in the game (built in F07 and F85) [DEFAULT]
All numbers are in `data/buildings.json` and `data/goods.json`; each country's starting buildings in `data/building_start.json`.
- **One building of each type per province, with a level and a production method.** A recipe is **per level, per day**: workers by pop group, electricity, inputs → outputs. A level-3 building needs three times as much of everything and makes three times the output.
- **Production methods (F85, Victoria 3-style; designer decision):** a building type has one or more methods, each a full recipe; a building runs one of them. Methods of the same building make the same goods per level but differ in workers and inputs: a **mechanized** farm needs 1,000 workers, fuel and fertilizer for 500 t of grain a day, a **traditional** one 10,000 workers and a little fertilizer, a **subsistence** one 100,000 workers and nothing else. So a poor country isn't as productive as a rich one: it runs labor-intensive methods. A newly built building runs its type's first (most modern) method. Switching methods, and research unlocking better ones, come with F88.
- **Real units, shortened on screen** (designer decision): goods are counted in tonnes and electricity in megawatt-hours, sized like real plants; the screens show 5 kt, 1.4 Mt, 2.5 GWh.
- **Workers:** a building offers jobs to the pops of its province (the jobs it keeps open, F65). Where a pop group is too small for all its jobs, the **best-paying employers fill first** (F65, Victoria 3; employers paying within 10 % of each other share alike), and a building runs only as far as its **scarcest pop group** allows; without workers of a group it needs, it stops. Buildings pay the going local wage (section 8.1) × their wage level (section 8.6).
- **National stockpile (since F65 the market's reserve):** what is made and not bought goes in; buyers draw on it when a day's goods run short; prices ignore it (Victoria 3 has no stockpile; designer decision to keep it, for food reserves, F08, and army supply, F75). A campaign starts with 15 days of what everyone buys; a country keeps at most 30 days of the most its market buys or sells in a day, and the rest is lost.
- **Imports (F19; F85's standing imports are gone):** what a country buys abroad arrives in its stockpile every morning and is sold on its market like its own goods (Japan's iron ore and coal, Europe's gas, Egypt's grain). See section 8.6, "How trade works in the game".
- **Missing inputs:** when a good is short, every building that needs it gets the same share and runs at **partial output**.
- **Electricity** can't be stored. Power plants make what the country asks for that day: its buildings, and **the rest of the economy and homes** (F85: 90 % of what the starting power plants can make, less what the starting buildings use, per person; it grows with the population). Plants that **burn nothing** (nuclear, hydro, wind, solar) run first, then the gas and coal plants for the rest (a plant with little to do burns less fuel). With too little electricity everyone gets the same share and buildings run at partial output; with none they stop, except **off the grid** (F85): mines, oil and gas fields and refineries keep 25 % of their output on their own generators, mechanized farms 50 %, traditional farms 80 %; subsistence farms and herders need no electricity. So a country whose power plants ran out of fuel slowly climbs back by itself (designer decision: running out of fuel stays a real risk, with slow self-recovery). The power grid (F74) will make electricity a matter of provinces and add blackout priorities.
- **Output** = the share of jobs filled (by the scarcest pop group) × the scarcest of electricity and inputs. The screens name what holds a building back most.
- **Every day, in three steps:** power plants (energy), then farms and mines (resource production), then everything else (industry). What a step makes is in the stockpile for the next step; the province's current owner gets it.
- **The building catalog (F85)** (per level and day; the first method of each; workers in the most productive countries):

| Building | Methods | Workers | Uses | Makes |
|---|---|---|---|---|
| Farm | mechanized / traditional / subsistence | 1,000 / 10,000 / 100,000 | 20 MWh, 5 t fuel, 10 t chemicals | 500 t grain |
| Ranch | intensive / pastoral herding | 900 / 30,000 | 15 MWh, 400 t grain, 2 t fuel | 300 t livestock and fish |
| Fishery | trawler fleet / artisanal | 400 / 10,000 | 5 MWh, 15 t fuel | 100 t livestock and fish |
| Iron mine | mechanized / labor-intensive | 500 / 2,500 | 200 MWh, 30 t fuel | 8,000 t iron ore |
| Coal mine | mechanized / labor-intensive | 700 / 3,500 | 150 MWh, 20 t fuel | 6,000 t coal |
| Copper mine | mechanized / labor-intensive | 1,000 / 4,000 | 250 MWh, 25 t fuel | 1,000 t copper ore |
| Bauxite mine | mechanized / labor-intensive | 400 / 1,600 | 100 MWh, 25 t fuel | 10,000 t bauxite |
| Quarry | mechanized / labor-intensive | 200 / 1,000 | 50 MWh, 10 t fuel | 5,000 t stone |
| Oil field | conventional drilling | 200 | 150 MWh | 5,000 t crude oil |
| Gas field | conventional drilling | 120 | 100 MWh | 3,000 t natural gas |
| Coal power plant | steam turbines | 300 | 6,000 t coal | 15,000 MWh |
| Gas power plant | combined cycle | 120 | 2,100 t natural gas | 15,000 MWh |
| Nuclear power plant | fission reactor | 700 | nothing (no uranium good yet) | 24,000 MWh |
| Hydro power plant | dam | 60 | nothing | 6,000 MWh |
| Wind farm | wind turbines | 30 | nothing | 2,400 MWh |
| Solar farm | solar panels | 20 | nothing | 1,200 MWh |
| Steel mill | integrated mill / older mill (blast furnace) | 2,500 / 10,000 | 2,500 MWh, 8,000 t iron ore, 3,500 t coal | 5,000 t steel |
| Oil refinery | distillation and cracking | 800 | 300 MWh, 10,000 t crude oil | 8,500 t fuel, 1,000 t chemicals |
| Chemical plant | gas-based chemistry | 500 | 400 MWh, 1,000 t natural gas | 1,200 t chemicals |
| Plastics plant | polymerization | 400 | 300 MWh, 1,100 t chemicals | 1,000 t plastic |
| Copper smelter | flash smelting | 600 | 600 MWh, 1,000 t copper ore, 20 t fuel | 250 t copper |
| Aluminum smelter | electrolysis | 1,500 | 15,000 MWh, 4,500 t bauxite | 1,000 t aluminum |
| Silicon plant | arc furnace | 300 | 1,200 MWh, 300 t stone, 150 t coal | 100 t silicon |
| Food processing plant | industrial / manual | 1,200 / 6,000 | 150 MWh, 1,500 t grain, 400 t livestock and fish | 1,600 t processed food |
| Electronics plant | automated / manual assembly | 1,500 / 6,000 | 400 MWh, 5 t silicon, 15 t copper, 40 t plastic | 100 t electronics |
| Consumer goods factory | assembly line / workshops | 10,000 / 60,000 | 300 MWh, 150 t steel, 150 t plastic, 20 t aluminum, 20 t electronics (workshops: 100 MWh, 150 t steel, 150 t chemicals) | 500 t consumer goods |

- **Starting buildings (F85):** each country's real production in 2024 (see `packages/tools/starting-data/README.md`): mines, fields and power plants from the energy statistics (Our World in Data: Energy Institute, Ember), steel and metals from worldsteel and the USGS (typed in approximately), farming, fishing and manufacturing from the World Bank; placed in the real producing provinces of the big producers, otherwise by population or land. The production methods follow each country's productivity: its farms employ its real farm workers, so India's farms are mostly subsistence and traditional, the United States' mechanized. Each province starts with the pop mix its buildings need (a steel province has more skilled workers); each country keeps the split of F06. The world makes about what it really makes (1.9 billion t of steel, 8.4 billion t of coal, 4.6 billion t of crude oil, 32,000 TWh), and buildings offer about **30 % of the world's jobs** (almost all farm jobs and the industries in the catalog); "the rest of the economy" keeps services, construction, vehicles and machinery.
- **Not built yet:** building slots, deposits, farmland and coastal rules, costs and construction (F12; the provinces where the starting mines and fields are become the deposits); switching production methods and research (F88); transport (F86); the power grid (F74); ownership by corporations or the state (F12, F89); military chains (F14, M3); fortifications and housing (planned with construction, combat and refugees: F141, F142). Until construction exists, **test buttons** change levels by hand.

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

Oil field ─► Oil refinery ─┬─► Fuel ─────────────► Farms, fisheries, mines (later supply depots, vehicles)
                          └─► Chemicals ─┬─► Explosives ─┐
Steel ───────────────────────────────────┼───────────────┴─► Ammunition plant ─► Ammunition
Heavy-metal mine ─► Heavy-metal refinery ─► Heavy metals ─► Disruptor round plant (+ steel + explosives) ─► Disruptor rounds

Farm ─► Grain ─┬─────────────► Food processing plant ─┬─► Processed food (civilians)
               └─► Ranch ─┐       ▲                    └─► Rations (army, M3)
Fishery ─────────────────┴─► Livestock and fish

Gas field ─► Natural gas ─┬─► Gas power plant ─► Electricity
                          └─► Chemical plant ─► Chemicals ─┬─► Plastics plant ─► Plastic ─┐
Copper mine ─► Copper smelter ─► Copper ─┐                 └─► Farms (fertilizer)        │
Quarry ─► Stone ─► Silicon plant ─► Silicon ─┴─► Electronics plant ◄──────────────────────┤
Bauxite mine ─► Aluminum smelter ─► Aluminum ─┐                  │                        │
Steel ─────────────────────────────────────────┴─► Consumer goods factory ◄──────────────┘
```
(The chains built in F85: food, steel, fuel, metals and consumer goods. Military chains come in M3.)

#### Building catalog [DEFAULT; full stats to be written, section 17]
*Built so far (F85): the extraction, energy, processing and civilian manufacturing buildings of the table above, except the heavy-metal and rare metals mines, the heavy-metal refinery, the construction materials, explosives and luxury goods buildings, the machine parts plant and the substation. The fortifications and housing are planned as F141 and F142.*
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

#### How food works in the game (built in F08) [DEFAULT]
All numbers are in `data/food.json` (and the map colors in `data/map_view.json` → `colors.food`); the rules are **Victoria 3's since its version 1.8** ("Famines, Starvation, Harvest Conditions") unless said otherwise (designer decision: Victoria 3 is the foundation).
- **What food is:** three goods: **grain** (it stands for all crops), **livestock and fish**, and **processed food** (section 8.3's food chain: farms, ranches and fisheries, food processing plants). People buy them on their market as two needs (F65): **basic food** (grain, livestock and fish at most 40 %, processed food) and **better food** (livestock and fish, processed food). Ranches feed grain to livestock; food processing plants use grain and livestock. Soldiers are pops and eat like everyone; refugees will (F33).
- **Food security** (Victoria 3, weekly, every pop): 100 % less the share of its income the pop spends on basic food, less the share of its country's basic food that went undelivered last week. *We differ in two ways:* the shortage counts **1.5×** (designer decision: our 2025 pops spend little of their income on food, 1–15 %, so Victoria 3's formula alone would let a country lose 60 % of its basic food before anyone starved); and food security moves **half the way** to that value each week (hunger takes weeks to turn into starvation, and people need a week to turn to other foods; without it a one-week gap made a famine). *We also add:* in the shortage, each good counts at most its share of the need (livestock and fish 40 %): our needs are counted in money, and when only livestock and fish are on sale the market lets people buy them for all their basic food, but a little meat costs as much as a lot of grain.
- **Starvation** (Victoria 3): below **40 %** food security a pop is in **mild starvation**, growing to **−35 % births and +30 % deaths** at 20 %; below **20 %** in **severe starvation**, growing to **−90 % births and +100 % deaths** at nothing. *We add* (designer decision): severe starvation kills up to **5 % of the starving people a year** on top (our death rates are real ones, far lower than Victoria 3's; famines killed 2–5 % of the people they struck a year: Bengal 1943, Ethiopia 1984); and starvation lowers the **standard of living** (up to −5 mild, −15 severe), our stand-in for Victoria 3's "starvation makes radicals" until stability (F10) and political movements (F121). Dependents share their province's lot. The deaths and lost births are counted.
- **Famine** (Victoria 3: a state's status; ours a province's): while at least **35 %** of a province's people starve and **15 %** starve severely. It records since when, its deaths and the births lost; it does nothing by itself (the harm is the starvation). The design's "riots and a big stability drop" come with stability (**F10**), which reads famines and starvation; famine events with the event engine (F95).
- **Food reserves:** the **national stockpile's food goods** (designer decision: not a separate store). A campaign starts with **30 days** of what the country buys of them, trade tops them up toward **30 days**, and the stockpile keeps at most **90 days** (other goods 15, 15 and 30). The game warns below **7 days**.
- **Rationing** (section 8.8's Rationing law, ahead of laws): **None → Light → Strict → Emergency.** Light cuts the rest of the economy's food by 25 % and people's better food by 20 % (−1 standard of living); Strict by half each and **stops food exports** (−3); Emergency leaves the rest of the economy a tenth and people only basic food (−6). Other countries ration **automatically**: a level as soon as their reserves fall below 15, 7 or 3 days or their basic food shortage reaches 2, 10 or 25 %, one level back a week once reserves are above 20, 12 or 6 days and the shortage is below its share. The player chooses on the Food screen, **Automatic** by default (designer decision); the Rationing law (F16) will make changing it cost time and political capital.
- **What the player sees:** the **Food key number** in the top bar (food reserves in days; yellow when low, red in a shortage or famine; its tooltip says how the country is fed); the **Food screen** (Economy lens: reserves, the shortage, food security, starving, famines and deaths; the rationing buttons; each food good made, imported, exported, eaten by people, used by buildings and the rest of the economy, in reserve; how each pop group is fed; the provinces where people go hungry; a **food crisis test tool**); the province panel's **Food** part; the **Food map mode** (provinces by food security, famines dark); the **Famine** and **Food reserves low** alerts; a toast when a famine breaks out or ends.
- **On the real world:** nobody starves at the start or in ten years without construction (rationing frees the food the rest of the economy buys; before F08 the microstates that import everything went 59 % short of basic food by year 10). About 30–40 countries ration lightly at times, a few (Lebanon, Venezuela, Botswana) strictly for years. Japan cut off from all trade: emergency rationing holds its shortage to 27 % (no starvation). Bangladesh losing its farms and cut off: famine in 5 provinces within about 10 weeks. The food crisis test tool (no food buildings, no reserves, no trade): famine within about four weeks.
- **Not built yet:** harvest conditions and seasons (Victoria 3 1.8; weather and seasons, **F54**, M3), pollution (M8b) and better farming methods (F88) on farm output; the Rationing law's politics (F16); stability, unrest and riots (F10); famine events (F95); feeding refugees (F33); the Swarm taking farmland (M7); the government buying food for its reserves (budget, F09).

### 8.6 Resources and Trade
- **Strategic resources:** steel, oil, rare metals (mechs, spaceports), **heavy metals** (disruptor rounds), energy, food, consumer goods, equipment.
- Each country has a **stockpile** of each resource. Shortages slow down any building that needs that resource.
- **Trade agreements** with other countries: buy or sell resources for money, or swap one resource for another. They need decent relations.
- **Trade routes** run through provinces and **sea zones**. If the Swarm takes or contests a province on the route, trade through it is disrupted.
- **Embargoes and sanctions** (section 6) cut off trade.
- During the war, **global markets** tighten: prices rise as producing countries fall.

#### Goods and markets (simplified Victoria)
- **Goods [DEFAULT, about 35]:** *(F85 built the ones in `data/goods.json`: grain, livestock and fish, iron ore, coal, crude oil, natural gas, copper ore, bauxite, stone, steel, fuel, chemicals, plastic, copper, aluminum, silicon, electronics, processed food, consumer goods, electricity. Copper, aluminum, silicon and plastic were added by the designer during F85.)*
  - **Raw:** grain, livestock/fish, iron ore, coal, oil, natural gas, copper ore, bauxite, rare metals, heavy metals, stone
  - **Intermediate:** steel, fuel, chemicals, plastic, copper, aluminum, silicon, explosives, electronics, machine parts, construction materials, electricity
  - **Civilian:** processed food, consumer goods, luxury goods, services
  - **Military:** rations, small arms, ammunition, disruptor rounds, vehicles, artillery, aircraft, missiles, mech parts, mech walkers, launch vehicles
- Each country has **one national market**. Buildings sell what they produce there and buy their inputs there. Pops buy their needs there. The government buys military goods there.
- **Prices** move with **supply and demand**. Shortages push prices up, which hurts pops' standard of living and raises building costs. Surpluses push prices down, which hurts producers' profits.
- **Building profitability:** buildings pay wages and buy inputs at market prices. Unprofitable buildings lay off workers or close, unless they're subsidized or nationalized.
- **International trade** connects national markets through trade agreements and routes. Goods flow toward higher prices, minus transport costs and tariffs.
- **Simplifications:** no detailed shipping, and prices (and corporation decisions) update **weekly**, not daily.

#### How markets work in the game (built in F65) [DEFAULT]
All numbers are in `data/market.json`, `data/goods.json` (base prices) and `data/pops.json` (needs, wealth); the rules are **Victoria 3's** (designer decision) unless said otherwise.
- **One market per country** for every good. Buildings sell what they make there and buy their inputs and grid electricity; pops buy their buy packages; **the rest of the economy** (a stand-in for everything the building catalog doesn't cover yet) buys what each market had left over at the start after exports (F19), per person, and buys less of what has become dearer (in proportion to its starting price ÷ price; F19: a good that fetches more abroad costs it what it fetches abroad); exporters (F19) buy there too, after the country's own buyers. At the start every market is in balance.
- **Base prices** (US$, real 2024 prices where the good has one, typed in approximately; correct them in `data/goods.json`): grain 600 /t (grain stands for all crops), livestock and fish 1,500, iron ore 110, coal 120, crude oil 580, natural gas 400, copper ore 1,800, bauxite 50, stone 20, steel 650, fuel 800, chemicals 900, plastic 1,300, copper 9,000, aluminum 2,400, silicon 2,500, electronics 8,000, processed food 1,300, consumer goods 5,000 /t, electricity 100 /MWh. Electronics, processed food and consumer goods have no world price: set so typical factories earn a normal profit.
- **Prices (weekly, every Monday):** price = reference price × (1 + 0.75 × (buy − sell) ÷ the smaller of the two), from the past week's buy and sell orders, between ×0.25 and ×1.75 of the base price. The reference price is the base price, or (F19) for a good the country trades, what trade makes it (see "How trade works in the game"). Sell orders: what the country makes plus its imports (electricity: what its plants could make). Buy orders: what buildings, pops, the rest of the economy and exporters want. The stockpile is a reserve that prices ignore.
- **Shortages:** when a good runs out, everyone gets the same share (buildings during the day's production; pops and the rest of the economy after it, leaving the buildings their share for the next day); exporters (F19) get only what is left after that. Buildings run at partial output (F07's rule; Victoria 3 slows them with a throughput penalty instead).
- **Substitution:** a need with several goods is split by each good's value on sale (its sell orders less half of what others buy of it; for electricity all of it, since it can't be stored), times its weight, each good covering at most 80 % unless it says otherwise (electricity can cover all of heating; livestock and fish at most 40 % of basic food). So people turn to what is available: with no coal they heat with electricity. (Victoria 3 counts units; our goods have real units, so we count their value.)
- **Building profitability:** a building's profit = its sales − its inputs and grid electricity − its wages, at its market's prices. It has **cash reserves** (at most 28 days of its wages): a profit fills them (half of it when they are empty, a quarter when nearly full) and the rest goes to the province's **owners** as dividends; a loss empties them. **Wages follow profits (Victoria 3, version 1.2):** a building raises its wage level 5 % when its profit is at least 20 % of its sales and it fills less than half its jobs, or at least 40 % while its workers live below what they expect (at most one raise in 4 weeks, up to ×5 the going wage); it cuts it 5 % when it loses money with reserves below half, or when it barely profits (under 5 %) while its workers live more than 1.33× what they expect (down to ×0.1). **Layoffs:** a building that still loses money at its lowest wage closes a tenth of its jobs a week, down to none (it stays standing); it hires a tenth back a week once it makes money. Closing and selling buildings come with their owners (F12, F89).
- **At the start** each building pays the going wage, or less if it can't afford it at base prices (so that 10 % of its sales are left as profit); its reserves are half full.
- **Subsistence buildings** (subsistence farming, pastoral herding; Victoria 3's subsistence farms): their workers share what the building makes, less its inputs; no wage, no profit, no layoffs. Their output still goes to the market (Victoria 3's peasants keep most of theirs).
- **What the player sees:** the **Markets screen** (Economy lens): every good with its price, ×base, the price week by week, the world price (F19), what is sold and bought a day (by buildings, people, the rest, for export) and the stock; the Buildings screen and the province panel show each building's profit, wage level, cash reserves and jobs kept open; the Population screen shows what people buy, their income and their standard of living; the alerts row warns of **layoffs** and of **shortages** (when people went without at least 2 % of their goods).
- **Not built yet:** local prices within a country and market access (Victoria 3; with transport, F86); the government buying goods (F14); corporations owning buildings, investing and going bankrupt (F12, F89). *(Taxes on incomes, dividends and goods: F09, section 8.2.)* *(Food reserves, rationing and famine: F08, section 8.5.)*

#### How trade works in the game (built in F19) [DEFAULT]
All numbers are in `data/trade.json` (and the world price uses `data/market.json` → `prices`); the rules are **Victoria 3's since its version 1.9** (designer decision: Victoria 3 is the foundation) unless said otherwise.
- **One World Market** for every good that can be shipped (all but electricity, which stays local until the power grid, F74; Victoria 3 keeps it local too). Countries trade with the World Market, not along trade routes (Victoria 3 1.9 removed them). Each importer buys from every exporter in proportion to what it offers, **halved for every 10 % of the base price that shipping and tariffs add**, so most goods come from big, nearby exporters; a few rounds of fitting make every exporter sell what it offers. Japan's iron ore comes mostly from Australia, then Brazil.
- **The world price** (weekly): Victoria 3's formula on the world's buy and sell orders as if the world were one market (what every market wants against what they make and the rest of the world sells), between ×0.25 and ×1.75 of the base price; it moves a fifth of the way there each week. *(We differ: Victoria 3's world price follows only what is traded; ours swung between its limits that way, since a big exporter's own market is far bigger than its exports.)*
- **How much moves, how fast** (Victoria 3's weekly trades): every Monday each country changes its import or export of a good by **a quarter of its market's gap** (what is wanted less what is on sale), plus what brings its stockpile back toward **15 days** of what it buys within four weeks. A country imports at most what it uses, exports at most what it makes. **Exporters follow their buyers:** when importers want more than is offered, exporters offer more in proportion, at most what their rest of the economy gives up at the highest price (people and buildings keep theirs) and what they shipped the week before. So a supplier cut off is replaced within about a month; the stockpile covers the first two weeks.
- **Goods move every day:** exporters buy on their home market after the country's own buyers (*we differ: Victoria 3 shares equally; a country looks after its own first*), what they got goes to the World Market with what the rest of the world sells, importers share it in proportion to their plans, and it reaches their stockpiles the next morning. Nothing appears from nowhere, except what the rest of the world sells.
- **What it costs:** **shipping** $20 per tonne for every 1,000 km by land and $1.50 by sea, on the cheapest route between the two capitals over provinces and sea zones (worked out at the start of a campaign; Australia → Japan about $21 a tonne, Brazil → China about $66, the United States → Egypt about $25; electronics hardly notice it, stone barely travels). **Tariffs** (Victoria 3): **5 % of the base price on imports**, none on exports, for every country until trade-policy laws; none between countries with a trade agreement. The importer pays world price + shipping + tariff (its **delivered cost**); the exporter gets the world price less its export tariff.
- **Prices with trade** *(we differ from Victoria 3)*: Victoria 3 has no stockpile and its markets can sit with more buyers than sellers for years; our goods are real tonnes in a real stockpile, so trade fills the gap and the cost of bringing goods in shows in the price instead. A market's **reference price** (where the price formula starts from) is the average of its own goods at the base price and its imports at their delivered cost (Japan's iron ore starts at about ×1.28); an exporter's is the average of the base price and what its exports fetch. A country that makes all it uses has the base price.
- **The rest of the world** (a stand-in): the world's buildings can't make enough **electronics, fuel, iron ore and copper ore** at the start (people's communication and transport needs, and steel mills without scrap, F88). F85's standing imports made the difference from nothing; now one seller on the World Market sells it, at the world price plus shipping of 10 % of the base price and the tariff, per person of the world's population (it grows with it). About 45 % of the world's imports by value come from it, mostly electronics and fuel. Remove it as construction (F12), production methods (F88) and a data pass on those needs close the gap.
- **At the start** each country imports exactly what its buildings and people want but it doesn't make (replacing the standing imports); countries with spare export in proportion to it (a quarter of the world's spare coal is exported, the rest stays with each country's rest of the economy); the rest of the world sells what is still missing. Prices start at the reference prices, and wages and wealth settle at them (F65's calibration), so every market starts in balance.
- **Trade agreements, embargoes and sanctions now:** an **embargo** stops all trade between two countries (importers turn to other suppliers at once; a country embargoed by all gets only what the rest of the world sells); a **trade agreement** takes the tariffs off between two countries; **sanctions** are embargoes from many countries at once. Built in the sim and saved; until diplomacy, the **Trade screen's test tools** start and lift embargoes. **Waits for diplomacy and the UN (M6):** proposing, accepting and breaking them, relations, AI decisions, UN sanctions votes, arms embargoes, and Victoria 3's goods transfer treaties.
- **What the player sees:** the **Trade screen** (Economy lens): exports, imports, the trade balance, tariff income, partners and what comes from the rest of the world; **Your trade** (every good with its price at home and on the World Market, imported and exported a day, the delivered cost and what shipping and tariffs add, how much the country makes itself; **Partners** shows where a good comes from and goes, with shipping); **Partners** (every country it trades with, what it buys and sells, the route's km on land and at sea and the shipping per tonne, embargoes and agreements; test tools); **World Market** (world prices with their price lines, what is traded, the rest of the world, the biggest exporters and importers). The Markets screen shows the world price and what is bought for export; the Buildings screen's stockpile shows what arrives a day.
- **Not built yet:** trade-policy laws (laws; *the tariff income reaches the treasury since F09*); trade centers, ports and merchant fleets that limit how much a country can ship (Victoria 3's trade capacity; transport, F86); Victoria 3's trade advantage and the monopoly bonus; routes cut by the Swarm or blockades (`computeRoutes` takes blocked provinces and sea zones; M7, M8); electricity across borders (F74); corporations earning from trade (F89).

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
