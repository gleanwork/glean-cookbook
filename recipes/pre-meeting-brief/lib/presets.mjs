// Choosing which trigger preset to watch. Datasource-agnostic: the datasource
// and the scheduling offset are arguments, so the same code drives a different
// preset family from .env.
//
// It refuses to default to a preset id or match on display name — both are
// tenant text, and a near-miss silently registers the wrong event. What it
// checks instead is capability: the preset must advertise a required
// `time_offset` offering the seconds the caller asked for.

/** Presets for one datasource, or all of them when no datasource is given. */
export function presetsFor(results = [], datasource = '') {
  const wanted = String(datasource).toLowerCase();
  if (!wanted) return [...results];
  return results.filter((preset) =>
    String(preset.datasource || '')
      .toLowerCase()
      .includes(wanted),
  );
}

function describe(presets) {
  if (presets.length === 0) return '  (this deployment serves none)';
  return presets
    .map((preset) => `  ${preset.preset_id}  ${preset.display_name}`)
    .join('\n');
}

/** Whether a preset can fire the requested number of seconds ahead. */
export function offersOffset(preset, offsetSeconds) {
  const offset = (preset?.inputs || []).find(
    (input) => input.field === 'time_offset',
  );
  return Boolean(
    offset?.is_required &&
    (offset.values || []).some(
      (value) => String(value.value) === String(offsetSeconds),
    ),
  );
}

/**
 * Resolves a configured preset id against the live catalog, throwing unless it
 * is served and advertises the requested offset. Lists the real alternatives.
 */
export function selectPreset(
  results = [],
  presetId = '',
  { datasource = '', offsetSeconds, envVar = 'GLEAN_TRIGGER_PRESET_ID' } = {},
) {
  // Two sets: everything this datasource serves, and the subset that can fire at
  // the requested offset. The id resolves against the first so "cannot fire that
  // far ahead" stays distinguishable from "not served"; the second is what gets
  // listed back, since only those are usable.
  const inDatasource = presetsFor(results, datasource);
  const available = inDatasource.filter(
    (preset) =>
      offsetSeconds === undefined || offersOffset(preset, offsetSeconds),
  );

  if (!presetId) {
    throw new Error(
      `Set ${envVar} to the preset to watch. This deployment serves:\n${describe(available)}`,
    );
  }

  const preset = inDatasource.find(
    (candidate) => candidate.preset_id === presetId,
  );
  if (!preset) {
    throw new Error(
      `Preset ${presetId} is not in this deployment's catalog. It serves:\n${describe(available)}`,
    );
  }
  if (offsetSeconds !== undefined && !offersOffset(preset, offsetSeconds)) {
    throw new Error(
      `Preset ${presetId} (${preset.display_name}) does not advertise a required time_offset offering ${offsetSeconds} seconds, so it cannot fire that far ahead. This deployment serves:\n${describe(available)}`,
    );
  }
  return preset;
}

/**
 * The inputs a preset requires, read from GLEAN_TRIGGER_INPUT_<FIELD>. Required
 * inputs differ per preset and the API rejects a trigger that omits one, so this
 * reads what the preset advertises rather than hardcoding a field. `defaults`
 * lets the recipe supply its own without the caller exporting anything.
 */
export function resolveInputs(preset, env = {}, defaults = {}) {
  const required = (preset?.inputs || []).filter((input) => input.is_required);
  const inputs = {};
  const missing = [];

  for (const input of required) {
    const key = `GLEAN_TRIGGER_INPUT_${input.field.toUpperCase()}`;
    const value = env[key] ?? defaults[input.field];
    if (value === undefined || value === '') {
      const allowed = (input.values || []).map((v) => v.value);
      missing.push(
        `  ${key}` +
          (allowed.length ? `  one of: ${allowed.join(', ')}` : '') +
          (input.display_name ? `  (${input.display_name})` : ''),
      );
      continue;
    }
    const allowed = (input.values || []).map((v) => String(v.value));
    if (allowed.length > 0 && !allowed.includes(String(value))) {
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
