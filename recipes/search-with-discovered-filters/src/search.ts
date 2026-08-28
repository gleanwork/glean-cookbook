export interface FilterFieldInfo {
  field: string;
  type: string;
  operators: string[];
  values?: string[];
}

export interface DatasourceFilterInfo {
  datasource: string;
  filters: FilterFieldInfo[];
}

export interface SearchFiltersResponse {
  datasources: DatasourceFilterInfo[];
  request_id: string;
}

export interface PlatformFilter {
  field: string;
  values: string[];
  operator?: string;
}

export interface SearchRequest {
  query: string;
  page_size?: number;
  cursor?: string;
  datasources?: string[];
  filters?: PlatformFilter[];
}

export interface SearchResult {
  url: string;
  title: string;
  datasource: string;
  snippets?: string[];
  document_type?: string | null;
}

export interface PlatformWarning {
  code: string;
  message: string;
}

export interface SearchResponse {
  results: SearchResult[];
  has_more: boolean;
  next_cursor: string | null;
  request_id: string;
  warnings: PlatformWarning[];
}

interface ProblemDetail {
  title?: string;
  detail?: string;
  code?: string;
  request_id?: string;
}

export interface PlatformSearchClientOptions {
  backend: string;
  token: string;
  fetch?: typeof fetch;
}

export interface ListFiltersOptions {
  datasources?: string[];
  query?: string;
}

export class PlatformSearchError extends Error {
  readonly status: number;
  readonly retryAfter?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { status: number; retryAfter?: string; requestId?: string },
  ) {
    super(message);
    this.name = 'PlatformSearchError';
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.requestId = options.requestId;
  }
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be blank.`);
  return normalized;
}

function parseBackend(value: string): string {
  const url = new URL(requireNonEmpty(value, 'GLEAN_SERVER_URL'));
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('GLEAN_SERVER_URL must use HTTPS.');
  }
  return url.toString().replace(/\/$/u, '');
}

function assertFiltersResponse(
  value: unknown,
): asserts value is SearchFiltersResponse {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as SearchFiltersResponse).datasources) ||
    typeof (value as SearchFiltersResponse).request_id !== 'string'
  ) {
    throw new Error('Search Filters returned an unexpected response shape.');
  }
}

function assertSearchResponse(value: unknown): asserts value is SearchResponse {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as SearchResponse).results) ||
    typeof (value as SearchResponse).has_more !== 'boolean' ||
    !Array.isArray((value as SearchResponse).warnings) ||
    typeof (value as SearchResponse).request_id !== 'string'
  ) {
    throw new Error('Search returned an unexpected response shape.');
  }
}

export class PlatformSearchClient {
  private readonly backend: string;
  private readonly token: string;
  private readonly request: typeof fetch;

  constructor(options: PlatformSearchClientOptions) {
    this.backend = parseBackend(options.backend);
    this.token = requireNonEmpty(options.token, 'GLEAN_API_TOKEN');
    this.request = options.fetch ?? fetch;
  }

  async listFilters(
    options: ListFiltersOptions = {},
  ): Promise<SearchFiltersResponse> {
    const url = new URL(`${this.backend}/api/search/filters`);
    for (const datasource of options.datasources ?? []) {
      url.searchParams.append('datasources', datasource);
    }
    if (options.query !== undefined) {
      url.searchParams.set('query', requireNonEmpty(options.query, 'query'));
    }

    const result = await this.requestJson(url, { method: 'GET' });
    assertFiltersResponse(result);
    return result;
  }

  async search(payload: SearchRequest): Promise<SearchResponse> {
    requireNonEmpty(payload.query, 'query');
    const result = await this.requestJson(
      new URL(`${this.backend}/api/search`),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    assertSearchResponse(result);
    return result;
  }

  private async requestJson(url: URL, init: RequestInit): Promise<unknown> {
    const response = await this.request(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Glean-Include-Experimental': 'true',
        ...init.headers,
      },
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      const problem = (body ?? {}) as ProblemDetail;
      const retryAfter = response.headers.get('retry-after') ?? undefined;
      const detail =
        problem.detail ?? problem.title ?? text.slice(0, 300) ?? 'No details';
      const retry = retryAfter ? ` Retry after ${retryAfter}.` : '';
      throw new PlatformSearchError(
        `${init.method ?? 'GET'} ${url.pathname} failed with HTTP ${response.status}: ${detail}.${retry}`,
        {
          status: response.status,
          retryAfter,
          requestId: problem.request_id,
        },
      );
    }

    return body;
  }
}

export interface SelectedFilter {
  field: string;
  value: string;
}

export interface SearchChoices {
  selectDatasource(
    datasources: DatasourceFilterInfo[],
  ): Promise<string> | string;
  selectFilter(
    datasource: DatasourceFilterInfo,
  ): Promise<SelectedFilter | undefined> | SelectedFilter | undefined;
}

export interface SearchFlowResult {
  catalog: SearchFiltersResponse;
  suggestions: SearchFiltersResponse;
  datasource: string;
  filter?: SelectedFilter;
  response: SearchResponse;
}

function selectedDatasource(
  response: SearchFiltersResponse,
  datasource: string,
): DatasourceFilterInfo {
  const selected = response.datasources.find(
    (candidate) => candidate.datasource === datasource,
  );
  if (!selected) {
    throw new Error(
      `Datasource "${datasource}" was not returned by Search Filters.`,
    );
  }
  return selected;
}

function validateFilter(
  datasource: DatasourceFilterInfo,
  filter: SelectedFilter | undefined,
): SelectedFilter | undefined {
  if (!filter) return undefined;
  const field = datasource.filters.find(
    (candidate) => candidate.field === filter.field,
  );
  if (!field) {
    throw new Error(
      `Field "${filter.field}" was not returned for ${datasource.datasource}.`,
    );
  }
  if (!field.operators.includes('EQUALS')) {
    throw new Error(`Field "${filter.field}" does not support EQUALS.`);
  }
  return {
    field: requireNonEmpty(filter.field, 'filter field'),
    value: requireNonEmpty(filter.value, 'filter value'),
  };
}

export async function runSearchFlow(
  client: PlatformSearchClient,
  query: string,
  choices: SearchChoices,
): Promise<SearchFlowResult> {
  const normalizedQuery = requireNonEmpty(query, 'query');
  const catalog = await client.listFilters();
  if (catalog.datasources.length === 0) {
    throw new Error(
      'Search Filters returned no datasources visible to this user.',
    );
  }

  const datasource = await choices.selectDatasource(catalog.datasources);
  selectedDatasource(catalog, datasource);

  const suggestions = await client.listFilters({
    datasources: [datasource],
    query: normalizedQuery,
  });
  const suggestionDatasource = selectedDatasource(suggestions, datasource);
  const filter = validateFilter(
    suggestionDatasource,
    await choices.selectFilter(suggestionDatasource),
  );

  const response = await client.search({
    query: normalizedQuery,
    page_size: 10,
    datasources: [datasource],
    ...(filter
      ? {
          filters: [
            {
              field: filter.field,
              values: [filter.value],
              operator: 'EQUALS',
            },
          ],
        }
      : {}),
  });

  return { catalog, suggestions, datasource, filter, response };
}
