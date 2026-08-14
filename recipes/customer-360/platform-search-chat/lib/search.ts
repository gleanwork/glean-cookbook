import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glean } from '@gleanwork/api-client';

export interface SearchHit {
  title: string;
  url: string;
  snippets: string[];
}

export interface Tile {
  id: string;
  label: string;
  query: string;
  results: SearchHit[];
  empty?: boolean;
}

export interface AccountPayload {
  account: {
    name: string;
  };
  tiles: Tile[];
}

export interface RawSearchResponse {
  results: Array<{
    url: string;
    title: string;
    snippets?: string[];
    datasource: string;
  }>;
  has_more: boolean;
  next_cursor: string | null;
  request_id: string;
  warnings: unknown[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function accountName(): string {
  return requireEnv('GLEAN_ACCOUNT_NAME');
}

export function tileQueries(account: string): Array<{
  id: string;
  label: string;
  query: string;
}> {
  return [
    {
      id: 'account-notes',
      label: 'Account notes',
      query: `${account} account notes ARR seats contacts`,
    },
    {
      id: 'renewal',
      label: 'Renewal status',
      query: `${account} renewal status`,
    },
    {
      id: 'security',
      label: 'Security questionnaire',
      query: `${account} security questionnaire`,
    },
  ];
}

export function buildSearchRequest(query: string): {
  query: string;
  page_size: number;
} {
  return { query, page_size: 3 };
}

export function parseSearch(data: RawSearchResponse): SearchHit[] {
  const results: SearchHit[] = [];
  for (const result of data.results ?? []) {
    if (!result.title || !result.url) continue;
    results.push({
      title: result.title,
      url: result.url,
      snippets: (result.snippets ?? []).filter(Boolean),
    });
  }
  return results;
}

function fixtureDir(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'fixtures',
  );
}

export function loadSearchFixtures(): Record<string, RawSearchResponse> {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDir(), 'search-responses.json'), 'utf8'),
  ) as Record<string, RawSearchResponse>;
}

function tileFromFixture(tile: {
  id: string;
  label: string;
  query: string;
}): Tile {
  const recorded = loadSearchFixtures()[tile.query];
  if (!recorded) {
    throw new Error(`No fixture recorded for query: ${tile.query}`);
  }
  const results = parseSearch(recorded);
  return { ...tile, results, empty: results.length === 0 };
}

async function searchLive(
  glean: Glean,
  tile: { id: string; label: string; query: string },
): Promise<Tile> {
  const response = await glean.search.query(buildSearchRequest(tile.query));
  const results = parseSearch(response as RawSearchResponse);
  return { ...tile, results, empty: results.length === 0 };
}

export async function loadAccount(): Promise<AccountPayload> {
  const account = accountName();
  const specs = tileQueries(account);
  if (process.env.GLEAN_USE_FIXTURE === 'true') {
    return {
      account: { name: account },
      tiles: specs.map((tile) => tileFromFixture(tile)),
    };
  }

  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL ??= 'true';
  const glean = new Glean({
    apiToken: requireEnv('GLEAN_API_TOKEN'),
    serverURL: requireEnv('GLEAN_SERVER_URL'),
  });
  const tiles = await Promise.all(specs.map((tile) => searchLive(glean, tile)));
  return { account: { name: account }, tiles };
}
