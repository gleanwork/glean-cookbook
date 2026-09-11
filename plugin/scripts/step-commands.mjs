// Match the site's sequential display without changing independently runnable
// registry commands. Only remove an identical prefix after it was entered.
export function humanizeStepCommands(steps) {
  const entered = new Set();
  return steps.map((step) => {
    const prefix = step.command?.match(
      /^(cd\s+("[^"]+"|'[^']+'|[^\s&]+)\s+&&\s+)/u,
    )?.[1];
    if (!prefix) return step;
    if (entered.has(prefix)) {
      return { ...step, command: step.command.slice(prefix.length) };
    }
    entered.add(prefix);
    return step;
  });
}
