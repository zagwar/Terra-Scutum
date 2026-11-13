# Next prompt

Paste this into a **new** Claude Code session on `terra-scutum` / `main`, after playing the F04 preview link and merging the F04 pull request. Your usual model is fine (F71 is not a ⚑ Fable task).

```
Build F71 (2025 starting data, first pass; M1, step 5 of the M1 build order). Read CLAUDE.md, GAME_DESIGN.md, docs/02_world_and_characters.md (section 4.3, country data), docs/07_politics.md (only the list of government types in section 8.12), docs/12_feature_tracker.md, docs/13_technical.md (including "What F132 built", "What F02 built" and "What F04 built"), docs/14_decision_log.md and docs/15_open_questions_and_gaps.md (the curated country list item).

Where we are: F132, F64, F01, F02, F70 (sea zones), F03 (strategy camera) and F04 (time system) are merged. The game shows the 3D world map with four map modes, province, sea zone and country panels, a strategy camera, and real time with pause: the sim worker runs the (still empty) daily tick at speeds 1–5, the date and speed control is top-right (Space pauses, 1–5 or the number pad's + and − choose the speed), and the game starts paused.

What F71 should do (first pass, as the build order says): approximate real-world 2025 starting data per country for the 172 countries: population, economy size (GDP) and government type, kept in data files with zod schemas and cross-checks, with sources noted. Show the new numbers in the country panel. Anything the design doesn't define yet gets a simple placeholder marked [DEFAULT]; ask me before inventing anything bigger. Tell me where the numbers come from and how accurate they are.

I'm a beginner, so walk me through anything I need to do myself step by step.
When the feature is done, push it, open the pull request, tell me how to test it on the preview link, then give me the next prompt.
```
