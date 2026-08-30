const DISCOVERY_URL = 'https://app.glean.com/config/search';

function fail(message) {
  throw new Error(message);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    fail(
      `${init?.method ?? 'GET'} ${url} -> ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${url} returned invalid JSON`);
  }
}

/**
 * Resolve a work email to a normalized customer backend URL.
 *
 * @param {string} email
 * @param {(url: string, init: RequestInit) => Promise<unknown>} [request]
 * @returns {Promise<{instance: string, backend: string}>}
 */
export async function discoverBackend(email, request = requestJson) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    fail('Enter a valid work email address.');
  }

  const config = await request(DISCOVERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized }),
  });
  const queryURL = config?.search_config?.queryURL;
  if (typeof queryURL !== 'string') {
    fail('Glean tenant discovery returned no search_config.queryURL.');
  }

  let hostname;
  try {
    hostname = new URL(queryURL).hostname.toLowerCase();
  } catch {
    fail('Glean tenant discovery returned an invalid queryURL.');
  }
  const match = hostname.match(
    /^([a-z0-9-]+?)(-be)?\.(?:glean\.com|askscio\.com)$/u,
  );
  if (!match || match[1] === 'app') {
    fail(
      `No customer Glean tenant was found for ${normalized}. Check the email and try again.`,
    );
  }

  const instance = match[1];
  return { instance, backend: `https://${instance}-be.glean.com` };
}
