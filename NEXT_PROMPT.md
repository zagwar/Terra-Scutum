# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main` after merging the F139 pull request (engine checkpoint 1 is decided: continue in the browser).

F06 is a **⚑ Fable** task (economy core): choose **Claude Fable 5.2** as the model for that new session.

```
Start M2 (a living country). First, propose the M2 build order (the order of M2's features in docs/12_feature_tracker.md, ending with F140, engine checkpoint 2) and add it to the feature tracker once I approve it. Then build F06 (population model: workforce, pop groups, employment, wages, growth, needs, standard of living; M2, ⚑ Fable: economy core). Read CLAUDE.md, GAME_DESIGN.md, docs/06_economy.md (section 8.1, and 8.3 and 8.6 where pops meet buildings and markets), docs/12_feature_tracker.md, docs/13_technical.md (above all "Architecture rules", "Performance plan and engine checkpoints", "Testing" and "What F139 built"), docs/14_decision_log.md and docs/15_open_questions_and_gaps.md.

First: check that the latest CI run on main (the F139 merge) is green. If it is red, fix that first and tell me what broke.

Where we are: M1 is finished (F132, F64, F01, F02, F70, F03, F04, F71, F122, F138, F05, F125, F133, F139 merged). At engine checkpoint 1 I decided to continue in the browser (my phone's benchmark results are in docs/13_technical.md, "Engine checkpoint 1"; I haven't run it on a PC yet, see section 17.3). F139 added the stress tests: `npm run runner -- --stress` runs a placeholder late-game load in the sim (data/stress_test.json → sim) and `?debug=stress` shows a late-game map with an on-screen counter and a benchmark; CI runs the browser tests in three parallel parts. F06 is the first real sim system: keep it within the performance budget (typed arrays, no allocation in the daily tick, heavy work weekly), and let the sim stress test use the real pops in place of the placeholder pops where that is simple (F140 does the rest).

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request and watch it (fix failing checks), tell me how to test it on the preview link, then give me the next prompt.
```
