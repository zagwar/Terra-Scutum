# Terra Scutum Design: Refugees

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 9. Refugees

- When a province becomes **Contested**, 5% of its population per day **[DEFAULT]** turns into refugees. They flee toward the nearest safe provinces, preferring their own country, then neighbors.
- Refugees in a host province **reduce stability** and **consume food and treasury money** unless they're housed in camps.
- **Crossing borders is political.** Each country sets a border policy, and AI countries do too:
  - **Open borders**: refugees enter freely; host stability drops, and relations with the source country improve.
  - **Camps**: costs money from the refugee services budget; cancels most of the stability penalty.
  - **Close borders**: refugees pile up in the contested province, and many are lost when it falls. Relations with the source country and humanitarian-minded countries get worse.
  - **Organized evacuation**: an active mission that uses transport and infrastructure and saves more people.
- **Refugee agreements** (section 6) let countries trade aid for taking refugees in.
- After 180 days in camps **[DEFAULT]**, refugees **integrate**: they become population, which adds Manpower and Industry to the host.
- Refugee routes **clog infrastructure**, so supply to the front slows.
- Large refugee numbers shift public opinion: more Panic, and anti-refugee pressure that pushes toward closing borders.

### 9.1 Reconstruction and Return
**Retaken provinces don't snap back to normal.** They have to be **rebuilt, decontaminated and repopulated**.
- **Clearing:** after a province is retaken, leftover tunnels and stray bugs have to be cleared (engineers, garrisons, seismic sensors). Until then, there's a risk of surprise emergences.
- **Decontamination:** Swarm biomass residue, **heavy-metal pollution** (section 5.4.2) and **fallout** have to be cleaned up using the Environment budget and remediation tech. Contaminated provinces have penalties to farming, health and growth.
- **Rebuilding:** Swarm-controlled provinces lost all their buildings. Infrastructure (rail, power, substations) comes first, then housing, then industry. Rebuilding uses construction like any other building project (private construction, state construction or contracts, section 8.3). Corporations only rebuild where it's safe and profitable.
- **Repopulating:** people return **voluntarily**. **Refugees are never forced to go home.** Each refugee group decides based on: how safe and rebuilt their home province is, jobs and housing there, how well they've integrated where they are, and the laws of both countries. Many stay where they've settled.
- **Encouraging return:** resettlement grants, housing programs and rebuilt jobs make return more attractive. Events and decisions cover big resettlement programs.
- **Stateless provinces:** provinces whose country collapsed can be claimed, administered by the UN (section 6.4), or contested in the endgame politics (section 3.4).
