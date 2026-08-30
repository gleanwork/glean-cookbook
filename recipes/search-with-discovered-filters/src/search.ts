import {
  chooseDatasource,
  chooseFilter,
  createTerminal,
  parseCliOptions,
  printSearchResponse,
} from './cli.js';
import { createGleanClient } from './client.js';
import { formatSdkError } from './errors.js';

/**
 * Lists visible datasources and common filter fields, requests query-specific
 * values for one datasource, then searches with the selected filter.
 *
 * @remarks
 * Filter discovery returns a best-effort catalog and may omit valid fields.
 * Query-specific values are bounded suggestions, not guaranteed matches. The
 * final Search request still enforces the caller's permissions.
 */
async function main() {
  const cliOptions = parseCliOptions();
  const glean = createGleanClient();
  const terminal = createTerminal();

  try {
    const { result: catalog } = await glean.search.listFilters();
    const datasource = await chooseDatasource(
      catalog.datasources,
      cliOptions.datasource,
      cliOptions.autoSelect,
      terminal,
    );

    const { result: suggestions } = await glean.search.listFilters(
      [datasource],
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

    const filter = await chooseFilter(
      filterInfo,
      cliOptions.filter,
      cliOptions.autoSelect,
      terminal,
    );
    const searchResponse = await glean.search.query({
      query: cliOptions.query,
      page_size: 10,
      datasources: [datasource],
      ...(filter ? { filters: [filter] } : {}),
    });

    printSearchResponse(searchResponse, datasource, filter);
  } finally {
    terminal?.close();
  }
}

main().catch((error: unknown) => {
  console.error(formatSdkError(error));
  process.exitCode = 1;
});
