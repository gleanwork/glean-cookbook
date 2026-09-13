---
name: agent_pattern_deep_execution
description: Load when the agent has a well-structured multi-step process with detailed conditions per step, yet still does shallow work on a run — skipping sub-steps, missing listed sources, or not following step conditions faithfully. Restructure the workflow or prompts; switch to a high-capability model and use other remedies to improve execution depth. Apply only after simpler patterns have been considered first.
---

# Pattern: deep execution via high-capability model

**Use when:** the agent's process is already well-decomposed — detailed step-by-step instructions, specific conditions per step, required sources listed — yet on a run the agent still does shallow work: it skips sub-steps, misses some of the listed sources in a step, or doesn't faithfully follow the conditions specified. This is an _execution depth_ problem, not a structural one.

**What to do:** for complex workflows, ask the agent to set up a task list tracking every required step and check it off as it progresses. For example:

```text
Set up this task list and track your progress:

[ ] Step 1: Read all source documents
[ ] Step 2: Identify key themes
[ ] Step 3: Generate an HTML dashboard

...Definitions of steps

(This is for illustration purposes only. Define the task list based on the task at hand.)
```

If task-list tracking does not resolve the shallow execution, switch to a high-capability model. High-capability models follow complex multi-condition instructions more precisely and are less likely to skip sub-steps or sources. This should be based on evidence from an actual run showing the shallow behavior — not applied blindly.

A higher-capability model may cost more, so check the pricing details before upgrading. Prefer upgrading to a stronger model within the same pricing tier first; only move to the next tier if no in-tier upgrade resolves the shallow behavior. See https://docs.glean.com/administration/llms for the current model list by tier and https://docs.glean.com/glean-core-suite-pricing for per-model pricing.
