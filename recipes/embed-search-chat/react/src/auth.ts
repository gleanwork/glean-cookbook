import type { AuthTokenDetails } from '@gleanwork/web-sdk';

const defaultEndpoint = '/api/glean-token';

function tokenEndpoint(): string {
  return import.meta.env.VITE_GLEAN_TOKEN_ENDPOINT?.trim() || defaultEndpoint;
}

export async function fetchGleanToken(): Promise<AuthTokenDetails> {
  const response = await fetch(tokenEndpoint(), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `The host app token endpoint returned ${response.status}. Implement ` +
        `${tokenEndpoint()} to exchange the signed-in user's IDP token for a short-lived Glean token.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${tokenEndpoint()} returned invalid JSON.`);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { token?: unknown }).token !== 'string' ||
    typeof (body as { expirationTime?: unknown }).expirationTime !== 'number'
  ) {
    throw new Error(
      `${tokenEndpoint()} must return { token: string, expirationTime: number } without logging or exposing the token.`,
    );
  }

  const token = (body as { token: string }).token;
  const expirationTime = (body as { expirationTime: number }).expirationTime;
  if (!token || expirationTime <= Math.floor(Date.now() / 1000)) {
    throw new Error(
      `${tokenEndpoint()} returned an expired or empty Glean token.`,
    );
  }

  return { token, expirationTime };
}
