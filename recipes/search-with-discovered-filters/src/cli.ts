import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import type {
  PlatformDatasourceFilterInfo,
  PlatformFilter,
  PlatformSearchResponse,
} from '@gleanwork/api-client/models/components';

export function parseCliOptions(argv = process.argv.slice(2)) {
  const cli = meow(
    `
      Usage
        $ npm start -- --query <text> [options]

      Options
        --email           Work email used to discover the Glean backend
        --server-url      Complete Glean backend origin; overrides --email
        --query, -q       Search query; searches all datasources by default
        --datasources, -d Comma-separated datasources to search
        --field, -f       Filter field; requires --value
        --value, -v       Filter value; requires --field
        --auto-select     Select the first discovered datasource and suggestion
        --pages           Number of Search result pages to fetch (default: 1)

      Example
        $ npm start -- --email you@example.com --query "quarterly planning"
    `,
    {
      importMeta: import.meta,
      argv,
      flags: {
        email: { type: 'string' },
        serverUrl: { type: 'string' },
        query: { type: 'string', shortFlag: 'q', isRequired: true },
        datasources: { type: 'string', shortFlag: 'd' },
        field: { type: 'string', shortFlag: 'f' },
        value: { type: 'string', shortFlag: 'v' },
        autoSelect: { type: 'boolean', default: false },
        pages: { type: 'number', default: 1 },
      },
    },
  );

  if (cli.input.length > 0) {
    throw new Error(`Unexpected argument: ${cli.input[0]}`);
  }

  const email = cli.flags.email?.trim();
  const serverUrl = cli.flags.serverUrl?.trim();
  const query = cli.flags.query.trim();
  const datasources = cli.flags.datasources
    ?.split(',')
    .map((datasource) => datasource.trim());
  const field = cli.flags.field?.trim();
  const value = cli.flags.value?.trim();
  const pages = cli.flags.pages;

  if (cli.flags.email !== undefined && !email) {
    throw new Error('--email must not be blank.');
  }
  if (cli.flags.serverUrl !== undefined && !serverUrl) {
    throw new Error('--server-url must not be blank.');
  }
  if (!query) throw new Error('--query must not be blank.');
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) {
    throw new Error('--pages must be an integer from 1 to 10.');
  }
  if (
    cli.flags.datasources !== undefined &&
    (!datasources || datasources.some((datasource) => !datasource))
  ) {
    throw new Error('--datasources must contain nonblank values.');
  }
  if (datasources && new Set(datasources).size !== datasources.length) {
    throw new Error('--datasources must not contain duplicates.');
  }
  if (cli.flags.field !== undefined && !field) {
    throw new Error('--field must not be blank.');
  }
  if (cli.flags.value !== undefined && !value) {
    throw new Error('--value must not be blank.');
  }
  if (Boolean(field) !== Boolean(value)) {
    throw new Error('--field and --value must be provided together.');
  }
  if (field && !datasources && !cli.flags.autoSelect) {
    throw new Error(
      '--datasources is required when using --field and --value, or use --auto-select.',
    );
  }

  const filter =
    field && value
      ? ({
          field,
          values: [value],
          operator: 'EQUALS',
        } satisfies PlatformFilter)
      : undefined;

  return {
    email,
    serverUrl,
    query,
    datasources,
    filter,
    autoSelect: cli.flags.autoSelect,
    pages,
  };
}

export function createTerminal() {
  return stdin.isTTY
    ? readline.createInterface({ input: stdin, output: stdout })
    : undefined;
}

async function chooseItem<T>(
  terminal: readline.Interface,
  prompt: string,
  items: readonly T[],
) {
  while (true) {
    const answer = (await terminal.question(prompt)).trim() || '1';
    const position = Number(answer);
    if (
      Number.isInteger(position) &&
      position >= 1 &&
      position <= items.length
    ) {
      const selected = items.at(position - 1);
      if (selected !== undefined) return selected;
    }
    console.log(`Enter a number from 1 to ${items.length}.`);
  }
}

export async function chooseDatasources(
  catalog: PlatformDatasourceFilterInfo[],
  requested: string[] | undefined,
  autoSelect: boolean,
  terminal: readline.Interface | undefined,
) {
  const first = catalog.at(0);
  if (!first) {
    throw new Error(
      'Search Filters returned no datasources visible to this user.',
    );
  }

  if (requested) {
    const available = new Set(
      catalog.map((datasource) => datasource.datasource),
    );
    const missing = requested.filter(
      (datasource) => !available.has(datasource),
    );
    if (missing.length > 0) {
      throw new Error(
        `Datasources "${missing.join(', ')}" were not returned by Search Filters.`,
      );
    }
    return requested;
  }

  if (autoSelect) return [first.datasource];
  if (!terminal) {
    throw new Error(
      'Pass --datasources when input is not interactive, or use --auto-select.',
    );
  }

  console.log('\nDatasources visible to you:');
  for (const [index, datasource] of catalog.entries()) {
    const fields = datasource.filters.map((filter) => filter.field).join(', ');
    console.log(
      `  ${index + 1}. ${datasource.datasource}${fields ? ` — ${fields}` : ''}`,
    );
  }
  console.log(
    '\nThis is a best-effort catalog. A field omitted here may still be valid.',
  );

  const selected = await chooseItem(
    terminal,
    '\nChoose a datasource [1]: ',
    catalog,
  );
  return [selected.datasource];
}

export async function chooseFilter(
  datasource: PlatformDatasourceFilterInfo,
  override: PlatformFilter | undefined,
  autoSelect: boolean,
  terminal: readline.Interface | undefined,
): Promise<PlatformFilter | undefined> {
  if (override) return override;

  const candidates = datasource.filters
    .filter(
      (field) =>
        field.operators.includes('EQUALS') && (field.values?.length ?? 0) > 0,
    )
    .map((field) => ({
      field: field.field,
      values: [...new Set(field.values ?? [])],
    }));
  const first = candidates.at(0);

  if (!first) {
    console.log(
      `\n${datasource.datasource} returned no suggested values for this query; continuing without a field filter.`,
    );
    return undefined;
  }
  if (autoSelect) {
    const value = first.values.at(0);
    if (!value) return undefined;
    return {
      field: first.field,
      values: [value],
      operator: 'EQUALS',
    };
  }
  if (!terminal) return undefined;

  console.log('\nSuggested fields and values for this query:');
  candidates.forEach((candidate, index) => {
    console.log(
      `  ${index + 1}. ${candidate.field} — ${candidate.values.slice(0, 5).join(', ')}`,
    );
  });
  const selectedField = await chooseItem(
    terminal,
    '\nChoose a field [1]: ',
    candidates,
  );
  const selectedValue = await chooseItem(
    terminal,
    '\nChoose a value [1]: ',
    selectedField.values,
  );

  return {
    field: selectedField.field,
    values: [selectedValue],
    operator: 'EQUALS',
  };
}

export function printSearchResponse(
  response: PlatformSearchResponse,
  datasources: string[] | undefined,
  filter: PlatformFilter | undefined,
  page = 1,
  resultOffset = 0,
  requestedPages = 1,
) {
  if (page === 1) {
    console.log(`\nSearch datasources: ${datasources?.join(', ') ?? 'all'}`);
    if (filter) {
      console.log(
        `Applied filter: ${filter.field} ${filter.operator ?? 'EQUALS'} ${filter.values.join(', ')}`,
      );
    }
  }

  if (response.warnings.length > 0) {
    console.log(`\nWarnings (page ${page}):`);
    for (const warning of response.warnings) {
      console.log(`  ${warning.code}: ${warning.message}`);
    }
  }

  console.log(`\nPage ${page} results (${response.results.length}):`);
  if (response.results.length === 0) {
    console.log('  No results matched this search.');
  }
  for (const [index, searchResult] of response.results.entries()) {
    console.log(
      `\n${resultOffset + index + 1}. ${searchResult.title} [${searchResult.datasource}]`,
    );
    console.log(`   ${searchResult.url}`);
    for (const snippet of searchResult.snippets?.slice(0, 2) ?? []) {
      console.log(`   ${snippet}`);
    }
  }

  if (response.has_more) {
    if (!response.next_cursor) {
      throw new Error('Search reported has_more without a next_cursor.');
    }
    if (page < requestedPages) {
      console.log(`\nMore results available; fetching page ${page + 1}...`);
    } else {
      console.log(
        `\nMore results available. Re-run with --pages ${requestedPages + 1} to fetch another page.`,
      );
    }
  }
  console.log(`\nRequest ID: ${response.request_id}`);
}
