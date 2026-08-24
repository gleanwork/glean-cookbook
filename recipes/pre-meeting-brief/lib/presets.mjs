// Choosing which trigger preset to watch. Datasource-agnostic: the datasource
// and the scheduling offset are arguments, so the same code drives a different
// preset family from .env.
//
// It refuses to default to a preset id or match on display name — both are
// tenant text, and a near-miss silently registers the wrong event. What it
// checks instead is capability: the preset must advertise a required
// `time_offset` offering the seconds the caller asked for.
//
// The catalog answers in two shapes, so reading it takes two calls. The list
// carries identity only — `preset_id`, `datasource`, `display_name`,
// `description`. `inputs` exist solely on the per-preset read. So `selectPreset`
// resolves an id against the list, and everything that reasons about inputs —
// `assertOffset`, `resolveInputs` — runs on what the per-preset read returned.
// Asking the list for `inputs` yields undefined, which reads as "this preset
// advertises nothing" and refuses every preset in the catalog.

/**
 * Presets for one datasource, or all of them when no datasource is given.
 * Compared exactly: a substring match would make `github` also select
 * `githubenterprise`.
 */
export function presetsFor(results = [], datasource = '') {
  const wanted = String(datasource).toLowerCase();
  if (!wanted) return [...results];
  return results.filter(
    (preset) => String(preset.datasource || '').toLowerCase() === wanted,
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
 * Resolves a configured preset id against the live list, throwing unless the
 * deployment serves it. Capability is not checked here: the list does not carry
 * `inputs`, so it cannot be. Pass the per-preset read to `assertOffset`.
 */
export function selectPreset(
  results = [],
  presetId = '',
  { datasource = '', envVar = 'GLEAN_TRIGGER_PRESET_ID' } = {},
) {
  const available = presetsFor(results, datasource);

  if (!presetId) {
    throw new Error(
      `Set ${envVar} to the preset to watch. This deployment serves:\n${describe(available)}`,
    );
  }

  const preset = available.find(
    (candidate) => candidate.preset_id === presetId,
  );
  if (!preset) {
    throw new Error(
      `Preset ${presetId} is not in this deployment's catalog. It serves:\n${describe(available)}`,
    );
  }
  return preset;
}

/**
 * Refuses a preset that cannot fire the requested number of seconds ahead.
 * Takes the per-preset read: on a list entry every preset looks incapable.
 */
export function assertOffset(preset, offsetSeconds) {
  if (offsetSeconds === undefined || offersOffset(preset, offsetSeconds))
    return;
  const advertised = (
    (preset?.inputs || []).find((input) => input.field === 'time_offset')
      ?.values || []
  ).map((value) => value.value);
  throw new Error(
    `Preset ${preset.preset_id} (${preset.display_name}) does not advertise a required time_offset offering ${offsetSeconds} seconds, so it cannot fire that far ahead.` +
      (advertised.length
        ? ` It offers: ${advertised.join(', ')}.`
        : ' It advertises no time_offset at all, so it fires on something that already happened — set GLEAN_TRIGGER_OFFSET_SECONDS=none for that preset family.'),
  );
}

/** Resolves advertised inputs from the environment and recipe defaults. */
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
