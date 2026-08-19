// Shared assertion for the trigger recipes: the deployment has to serve the
// presets they register. Rollout is uneven, so this distinguishes "your recipe
// is broken" from "your tenant hasn't got it yet" -- and it is the only part
// verifiable without originating a real event. Reads the catalog, nothing else.

/** GET /api/trigger-presets, every page. Experimental, so it needs the opt-in header. */
export async function triggerPresets() {
  const server = (
    process.env.GLEAN_SERVER_URL ||
    `https://${process.env.GLEAN_INSTANCE}-be.glean.com`
  ).replace(/\/$/u, '');
  const out = [];
  let cursor = '';
  do {
    const response = await fetch(
      `${server}/api/trigger-presets?page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      {
        headers: {
          authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
          'content-type': 'application/json',
          'x-glean-include-experimental': 'true',
        },
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `/api/trigger-presets returned ${response.status}: ${JSON.stringify(body).slice(0, 200)}. ` +
          `The Triggers API is experimental; a 404 or 403 means it is not enabled on this deployment.`,
      );
    }
    out.push(...(body.results ?? []));
    cursor = body.has_more ? (body.next_cursor ?? '') : '';
  } while (cursor);
  return out;
}

/** Null when the datasource is served, else what is missing plus what is. */
export function assertServes(presets, datasource) {
  const wanted = String(datasource).toLowerCase();
  const matching = presets.filter(
    (preset) => String(preset.datasource || '').toLowerCase() === wanted,
  );
  if (matching.length > 0) return null;
  const served = [
    ...new Set(presets.map((preset) => preset.datasource)),
  ].sort();
  return (
    `this deployment serves no ${datasource} trigger presets, so the recipe ` +
    `cannot be built here. It serves: ${served.join(', ') || '(nothing)'}`
  );
}
