Before implementing a Glean API or SDK response shape, confirm the current supported contract.
Use this plugin's `glean-developer-docs` MCP tools when available, or another available official
documentation/SDK source. Verify scope, endpoint, field, and version support; do not infer it
from a future-looking name or another surface. Report missing evidence rather than inventing
compatibility behavior. Recipe source defines the agreed outcome, but incorrect API assumptions
must be corrected at that source, not hidden in wrappers or generated output.
