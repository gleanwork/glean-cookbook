# Glean Cookbook

The cookbook describes repeatable ways to build with Glean and the interaction contracts coding agents use to deliver them.

## Language

**Recipe**:
A customer-facing, repeatable build or integration outcome composed from one or more Glean platform capabilities.

**Variant**:
One implementation path within a recipe. Variants may use different surfaces, authentication methods, or execution types while producing the same recipe outcome.

**Category**:
The problem domain a recipe addresses, such as search, workflow, agent, or portal.
_Avoid_: Recipe type

**Build method**:
How the implementation is produced: from a deterministic scaffold, by adapting an existing system, or in an external builder.

**Execution contract**:
The questions, authentication, verification, run behavior, and handoff that a coding agent follows for a recipe or variant.

**Execution type**:
The interaction shape of an execution contract: local web application, existing application, command-line program, host configuration, external builder, or hybrid service.
_Avoid_: Recipe type

**Demo mode**:
An explicitly enabled sample-data execution path. It is available only when the cookbook demo environment flag is present and is never offered during a configured run.

## Build architecture

**Artifact definition**:
A declarative source, target selector, and optional transformation in `scripts/artifacts.config.mjs`.
Definitions are the only place shared standalone-scaffold files are distributed.

**Artifact plan**:
The complete in-memory set of generated files compiled from the artifact definitions. Writing and
stale checking consume the same plan; check mode never writes or restores files.

Recipe skills are rendered from `plugin/templates/recipe-skill.md.hbs`, recipe metadata, the execution
descriptors in `config/execution-types.json`, and pluginpack partials. Shared prose belongs in a
partial, not in the renderer or generated source skills.
