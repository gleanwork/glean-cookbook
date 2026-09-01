import {
  chooseDatasources,
  chooseFilter,
  createTerminal,
  parseCliOptions,
  printSearchResponse,
} from './cli.js';
import { createGleanClient } from './client.js';
import type { PlatformFilter } from '@gleanwork/api-client/models/components';
import { formatSdkError } from './errors.js';

/**
 * Searches across all datasources by default. When a datasource list is
 * supplied, discovers query-specific values for a single datasource and
 * applies the selected filter.
 *
 * @remarks
 * Filter discovery returns a best-effort catalog and may omit valid fields.
 * Query-specific values are bounded suggestions, not guaranteed matches. The
 * final Search request still enforces the caller's permissions.
 */
async function main() {
  const cliOptions = parseCliOptions();
  const glean = await createGleanClient({
    email: cliOptions.email,
    serverUrl: cliOptions.serverUrl,
  });
  const terminal = createTerminal();

  try {
    let datasources: string[] | undefined;
    let filter: PlatformFilter | undefined = cliOptions.filter;

    if (cliOptions.datasources || cliOptions.autoSelect || filter) {
      const { result: catalog } = await glean.search.listFilters();
      datasources = await chooseDatasources(
        catalog.datasources,
        cliOptions.datasources,
        cliOptions.autoSelect,
        terminal,
      );

      if (!filter && datasources.length === 1) {
        const datasource = datasources[0];
        const { result: suggestions } = await glean.search.listFilters(
          datasources,
          cliOptions.query,
        );
        const filterInfo = suggestions.datasources.find(
          (candidate) => candidate.datasource === datasource,
        );
        if (!filterInfo) {
          throw new Error(
            `No filter metadata for "${datasource}" (request ${suggestions.request_id}).`,
          );
        }

        filter = await chooseFilter(
          filterInfo,
          undefined,
          cliOptions.autoSelect,
          terminal,
        );
      }
    }

    const searchRequest = {
      query: cliOptions.query,
      page_size: 10,
      ...(datasources ? { datasources } : {}),
      ...(filter ? { filters: [filter] } : {}),
    };
    let cursor: string | undefined;
    let resultOffset = 0;

    for (let page = 1; page <= cliOptions.pages; page += 1) {
      const searchResponse = await glean.search.query({
        ...searchRequest,
        ...(cursor ? { cursor } : {}),
      });

      printSearchResponse(
        searchResponse,
        datasources,
        filter,
        page,
        resultOffset,
        cliOptions.pages,
      );
      resultOffset += searchResponse.results.length;

      if (!searchResponse.has_more) break;
      if (!searchResponse.next_cursor) {
        throw new Error('Search reported has_more without a next_cursor.');
      }
      if (searchResponse.next_cursor === cursor) {
        throw new Error(
          'Search returned the same cursor for consecutive pages.',
        );
      }
      cursor = searchResponse.next_cursor;
    }
  } finally {
    terminal?.close();
  }
}

main().catch((error: unknown) => {
  console.error(formatSdkError(error));
  process.exitCode = 1;
});
