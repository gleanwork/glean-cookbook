import type { Glean } from '@gleanwork/api-client';
import type {
  PlatformDatasourceFilterInfo,
  PlatformSearchFiltersResponse,
  PlatformSearchResponse,
} from '@gleanwork/api-client/models/components';

export type DatasourceFilterInfo = PlatformDatasourceFilterInfo;
export type SearchFiltersResponse = PlatformSearchFiltersResponse;
export type SearchResponse = PlatformSearchResponse;
export type PlatformSearchSdk = Pick<Glean['search'], 'listFilters' | 'query'>;

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

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be blank.`);
  return normalized;
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

/**
 * Compose the official SDK's discovery and Search methods without recreating
 * its transport, generated request types, response validation, or errors.
 */
export async function runSearchFlow(
  search: PlatformSearchSdk,
  query: string,
  choices: SearchChoices,
): Promise<SearchFlowResult> {
  const normalizedQuery = requireNonEmpty(query, 'query');
  const { result: catalog } = await search.listFilters();
  if (catalog.datasources.length === 0) {
    throw new Error(
      'Search Filters returned no datasources visible to this user.',
    );
  }

  const datasource = await choices.selectDatasource(catalog.datasources);
  selectedDatasource(catalog, datasource);

  const { result: suggestions } = await search.listFilters(
    [datasource],
    normalizedQuery,
  );
  const suggestionDatasource = selectedDatasource(suggestions, datasource);
  const filter = validateFilter(
    suggestionDatasource,
    await choices.selectFilter(suggestionDatasource),
  );

  const response = await search.query({
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
