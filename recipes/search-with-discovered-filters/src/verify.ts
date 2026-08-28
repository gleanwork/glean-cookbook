import 'dotenv/config';
import {
  PlatformSearchClient,
  runSearchFlow,
  type DatasourceFilterInfo,
  type SelectedFilter,
} from './search.js';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseQuery(args: string[]): string {
  const index = args.indexOf('--query');
  const query =
    index >= 0 ? args[index + 1] : process.env.GLEAN_DEMO_QUERY?.trim();
  if (!query) {
    throw new Error(
      'Pass --query "<topic>" or set GLEAN_DEMO_QUERY to a topic in your Glean instance.',
    );
  }
  return query;
}

function firstSuggestedFilter(
  datasource: DatasourceFilterInfo,
): SelectedFilter | undefined {
  for (const field of datasource.filters) {
    if (!field.operators.includes('EQUALS')) continue;
    const value = field.values?.find((candidate) => candidate.trim());
    if (value) return { field: field.field, value };
  }
  return undefined;
}

async function main(): Promise<void> {
  const query = parseQuery(process.argv.slice(2));
  const client = new PlatformSearchClient({
    backend: requireEnv('GLEAN_SERVER_URL'),
    token: requireEnv('GLEAN_API_TOKEN'),
  });
  const result = await runSearchFlow(client, query, {
    selectDatasource: (datasources) => datasources[0].datasource,
    selectFilter: firstSuggestedFilter,
  });

  if (!result.catalog.request_id || !result.suggestions.request_id) {
    throw new Error('Filter discovery did not return request IDs.');
  }
  if (!result.response.request_id) {
    throw new Error('Search did not return a request ID.');
  }
  if (result.response.has_more && !result.response.next_cursor) {
    throw new Error('Search reported has_more without a next_cursor.');
  }

  console.log(
    `✓ discovered ${result.catalog.datasources.length} datasource(s)`,
  );
  console.log(`✓ searched the returned datasource ${result.datasource}`);
  console.log(
    result.filter
      ? `✓ applied ${result.filter.field} EQUALS ${result.filter.value}`
      : '✓ datasource returned no suggested field values; applied datasource scope',
  );
  console.log(
    `✓ received ${result.response.results.length} result(s), ${result.response.warnings.length} warning(s)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
