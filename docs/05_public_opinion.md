# Terra Scutum Design: Public opinion stances and influence

> Part of the design doc. Index: `GAME_DESIGN.md`. Section numbers are kept across files, so "section 8.3" means the same thing everywhere.

## 7. Public Opinion and Influence (strongest during Phase 0)

When the object is detected, nobody knows what it is or how to respond. In every country, the population is split across **stances** toward the object. These shares add up to 100%.

| Stance | Belief | Effect on the country |
|---|---|---|
| **Denial** | It's nothing, a hoax, or it will miss | Low military spending; refuses to prepare |
| **Prepare** | It's a threat; arm up | Builds defenses; accepts alliances and research sharing |
| **Contact** | It's peaceful; welcome it | Opposes militarization, protests and lobbies against defense spending, slows mobilization laws. **Mostly a pre-arrival force**: its main job is to slow down the player's buildup |
| **Panic** | The end is coming | Lowers stability, causes early migration and hoarding, hurts the economy |

- **Starting shares** differ by country **[DEFAULT: mostly Denial]**.
- **Drift:** stances shift on their own over time, driven by news events (telescope images, leaks, government statements).
- **Influence** is a resource the player earns each day, based on their country's media reach, stability and relations.
- **Influence actions** (at home or in other countries; abroad costs more and depends on relations and on your **intel network** there, section 6.3):
  - **Media campaign**: push one stance in a country
  - **Release scientific data**: moves Denial to Prepare; Panic risk if overdone
  - **Cover-up**: reduces Panic, but increases Denial
  - **Fund movements / politicians**: slowly shifts a country's policy
  - **Counter-propaganda**: cancels another country's influence campaign
- **Opinion limits policy.** Public opinion decides which law levels a country can adopt (section 8.8). For example, a country that's mostly in Denial can't go past Early mobilization or Limited conscription without a big stability hit. Convincing people is how you unlock preparation before landfall.
- **After landfall** Denial and Contact both **collapse quickly**. Once the bugs start killing people, almost nobody sides with them. A tiny remnant forms **rare pro-alien cults**: small, occasional sources of sabotage or unrest, not an organized enemy faction. Stances still matter for stability, the willingness to accept refugees, and the willingness to use nukes.
