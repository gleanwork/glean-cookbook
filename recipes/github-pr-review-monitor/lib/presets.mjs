// Choosing which trigger presets to register. Datasource-agnostic on purpose:
// nothing here knows what a pull request is, so the same code points at Gong or
// calendar presets by changing .env. The one rule is that the choice is
// explicit — matching by display name silently registers the wrong event.

/**
 * Presets for one datasource, or all of them when none is given. Compared
 * exactly: a substring match would make `github` also select `githubenterprise`.
 */
export function presetsFor(results = [], datasource = '') {
  const wanted = String(datasource).toLowerCase();
  if (!wanted) return [...results];
  return results.filter(
    (preset) => String(preset.datasource || '').toLowerCase() === wanted,
  );
}

function describe(presets) {
  if (presets.length === 0) return '  (the catalog serves none)';
  return presets
    .map((preset) => `  ${preset.preset_id}  ${preset.display_name}`)
    .join('\n');
}

/**
 * Resolves configured preset ids against the live catalog, in the order given.
 * Throws unless every id is served, so a partial set is never registered.
 */
export function selectPresets(results = [], presetIds = [], datasource = '') {
  const available = presetsFor(results, datasource);
  const label = datasource ? `${datasource} ` : '';

  if (presetIds.length === 0) {
    throw new Error(
      `Set GLEAN_TRIGGER_PRESET_IDS to the ${label}presets to watch. This deployment serves:\n${describe(available)}`,
    );
  }

  const ids = [...new Set(presetIds)];
  const byId = new Map(available.map((preset) => [preset.preset_id, preset]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(
      `This deployment does not serve ${label}preset(s): ${missing.join(', ')}.\n` +
        `The trigger rollout may not have reached your tenant. It serves:\n${describe(available)}`,
    );
  }

  return ids.map((id) => byId.get(id));
}

/** Resolves the inputs advertised by one detailed preset. */
export function resolveInputs(preset, env = {}, defaults = {}) {
  const advertised = preset?.inputs || [];
  const inputs = {};
  const missing = [];

  for (const input of advertised) {
    const key = `GLEAN_TRIGGER_INPUT_${input.field.toUpperCase()}`;
    const value = env[key] ?? defaults[input.field];
    const allowed = (input.values || []).map((v) => String(v.value));
    if (value === undefined || value === '') {
      if (!input.is_required) continue;
      missing.push(
        `  ${key}` +
          (allowed.length ? `  one of: ${allowed.join(', ')}` : '') +
          (input.display_name ? `  (${input.display_name})` : ''),
      );
      continue;
    }
    // A truncated picklist advertises some of its values, not all of them, so
    // refusing what it does not list would reject a legitimate one.
    if (
      allowed.length > 0 &&
      !input.is_truncated &&
      !allowed.includes(String(value))
    ) {
      throw new Error(
        `${key}=${value} is not one this preset accepts. Allowed: ${allowed.join(', ')}`,
      );
    }
    inputs[input.field] = String(value);
  }

  if (missing.length > 0) {
    throw new Error(
      `Preset ${preset.preset_id} requires inputs this environment does not supply:\n${missing.join('\n')}`,
    );
  }
  return inputs;
}
