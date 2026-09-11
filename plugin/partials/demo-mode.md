### Select the run mode

This applies only when the selected recipe explicitly declares a presentation-demo path.
Do not infer demo support merely because this shared instruction is present. Where supported,
check whether `GLEAN_COOKBOOK_DEMO` is exactly `true` without printing environment values.

- When enabled, follow the recipe's documented sample-data command and its applicable handoff.
  Skip only configuration and authentication that the documented demo does not need. Label the
  result as a demo, not live verification.
- Otherwise, follow the normal configured path. Do not offer an undeclared or gated demo or
  silently replace live calls with sample data.

Offline fixture tests are separate from presentation demos. Run required tests in either mode;
do not suppress their failures or skip them just because demo mode is disabled.
