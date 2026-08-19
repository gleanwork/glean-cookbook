// `integrate` recipe: the agent is generated in the reader's own harness, so
// there is no code of ours to drive. What is verifiable is the foundation --
// Gmail indexed, without which the trigger never fires and the draft has nothing
// to ground in. The demo queries need real inbound mail, so they skip.

// One search call. Nothing is written and no agent is run.
export const sideEffects = 'read-only';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  ['GLEAN_SERVER_URL', 'GLEAN_INSTANCE'],
];

// `app` is the datasource facet, not `datasource` (that is a field on a result).
async function gmailIsIndexed() {
  const server = (
    process.env.GLEAN_SERVER_URL ||
    `https://${process.env.GLEAN_INSTANCE}-be.glean.com`
  ).replace(/\/$/u, '');
  const response = await fetch(`${server}/rest/api/v1/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'the',
      pageSize: 1,
      requestOptions: {
        facetFilters: [
          {
            fieldName: 'app',
            values: [{ value: 'gmail', relationType: 'EQUALS' }],
          },
        ],
      },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `/search returned ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  return ((await response.json()).results ?? []).length > 0;
}

export async function setup() {
  return { gmail: await gmailIsIndexed() };
}

const NEEDS_LIVE_MAIL =
  'needs a real message sent to an activated agent. Publishing does not ' +
  'activate the trigger, and no API here can originate customer mail — send ' +
  'it by hand and check the run, the Gmail draft, and the owner DM.';

export async function run(query, { gmail }) {
  if (!gmail) {
    return {
      skip:
        'no Gmail documents came back for this credential. Either Gmail is not ' +
        'indexed — which the recipe requires — or the probe query matched none ' +
        'of what is. Check a Gmail search in the UI before going further.',
    };
  }
  return { skip: NEEDS_LIVE_MAIL };
}
