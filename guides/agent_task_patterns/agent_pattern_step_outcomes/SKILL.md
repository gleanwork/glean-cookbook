---
name: agent_pattern_step_outcomes
description: Proactive pattern for SOP-style agents with step granularity. After each heavy research or long data-processing step, instruct the agent to print the outcome in the UI before proceeding — so the user sees meaningful results as they emerge rather than waiting for the final output.
---

# Pattern: step outcomes for SOP agents

**Use when:** building a SOP-style agent — one structured around discrete, named steps with clear step boundaries — where one or more steps involve heavy research or long data processing. For those steps, having the agent surface the outcome immediately after completion is always preferred over silently moving on.

This is a proactive build-time pattern, not a fix applied after observing a problem. Apply it while designing the agent's instructions.

**What to do:** for each heavy research or long data-processing step, add an instruction for the agent to print a brief outcome statement to the user before starting the next step. The statement should convey what the step produced — key counts, findings, or a one-line summary — not a verbose recap.

Examples of well-formed outcome statements:

- After pulling account data: _"Found 4 active opportunities across 3 accounts, totaling $1.8M in pipeline."_
- After researching open escalations: _"Retrieved 9 open P1 escalations — 6 flagged as overdue."_
- After processing a dataset: _"Processed 142 records; 18 matched the filter criteria."_

**When NOT to apply it:** lightweight steps (a single lookup, a quick check) don't warrant an outcome statement — only steps where the work is substantial enough that the user would want to know the result before the agent continues. Non-SOP agents (open-ended or conversational) don't have the step structure this pattern requires.
