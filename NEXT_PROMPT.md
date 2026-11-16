# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main` after merging the F06 pull request.

F07 is a **⚑ Fable** task (economy core): choose **Claude Fable 5.2** as the model for that new session.

```
Build F07 (buildings with recipes: inputs → outputs, levels, workers, electricity; partial output when inputs are missing; M2 build order step 2, ⚑ Fable: economy core). Read CLAUDE.md, GAME_DESIGN.md, docs/06_economy.md (section 8.3 above all "How buildings work", section 8.1 with "How the population model works", and 8.6 where buildings meet markets), docs/12_feature_tracker.md (the M2 build order), docs/13_technical.md (above all "Architecture rules", "Performance plan and engine checkpoints", "Testing" and "What F06 built"), docs/14_decision_log.md and docs/15_open_questions_and_gaps.md (section 17.3: the stand-ins F06 left).

First: check that the latest CI run on main (the F06 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: M2 has started. F06 (the population model) is merged: every province has dependents and a workforce in six pops (laborers, skilled workers, professionals, owners, officials, soldiers) with jobs, wages and a standard of living, starting from real data (province populations, birth and death rates, labor force, unemployment). Until now a stand-in economy gives the pops their jobs and wages (data/pops.json → placeholderEconomy; GameState.population.jobs and .wage): F07's buildings should take that over (workers by pop group, wages paid by buildings), and the stand-in should only fill what buildings don't cover yet. The building catalog, the production chains and each country's starting buildings are the next feature (F85), and markets with prices are F65: F07 needs only a few example buildings and recipes to prove the system, and may use fixed prices and a simple national stockpile [DEFAULT] until F65. The design leaves the building stats open (section 17.2): propose the building data format and the handful of example buildings to me before coding, and ask me what F07 should show on screen. Keep it within the performance budget (typed arrays, no allocation in the daily tick, heavy work weekly), and let the sim stress test use the real buildings in place of the placeholder buildings where that is simple (F140 does the rest).

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
