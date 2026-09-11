# Glean Cookbook

The cookbook teaches the implementations we recommend for building with Glean. Its authored
recipes are the source of truth for developer instructions and coding-agent execution contracts.
Rendered pages and skills present that source; they do not repair it.

## Language

**Recipe**:
A customer-facing, repeatable build or integration outcome composed from supported Glean
capabilities and idiomatic packages. It is a recommended implementation within a stated scope,
not merely a runnable demo.

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

**Verification**:
Evidence that the actual deployed instructions produce the promised outcome when followed cold
in the declared environment. Local tests, a merge, a visibility flag, and deployment alone are
not verification. See the [release lifecycle](CONTRIBUTING.md#release-and-verification-lifecycle)
for the distinct review, merge, deployment, verification, and publication states.

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
