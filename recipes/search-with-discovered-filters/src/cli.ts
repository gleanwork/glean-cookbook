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
        --query, -q       Search query
        --datasource, -d  Datasource returned by filter discovery
        --field, -f       Filter field; requires --value
        --value, -v       Filter value; requires --field
        --auto-select     Select the first discovered datasource and suggestion

      Example
        $ npm start -- --query "quarterly planning" --datasource jira
    `,
    {
      importMeta: import.meta,
      argv,
      flags: {
        query: { type: 'string', shortFlag: 'q', isRequired: true },
        datasource: { type: 'string', shortFlag: 'd' },
        field: { type: 'string', shortFlag: 'f' },
        value: { type: 'string', shortFlag: 'v' },
        autoSelect: { type: 'boolean', default: false },
      },
    },
  );

  if (cli.input.length > 0) {
    throw new Error(`Unexpected argument: ${cli.input[0]}`);
  }

  const query = cli.flags.query.trim();
  const datasource = cli.flags.datasource?.trim();
  const field = cli.flags.field?.trim();
  const value = cli.flags.value?.trim();

  if (!query) throw new Error('--query must not be blank.');
  if (cli.flags.datasource !== undefined && !datasource) {
    throw new Error('--datasource must not be blank.');
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

  const filter =
    field && value
      ? ({
          field,
          values: [value],
          operator: 'EQUALS',
        } satisfies PlatformFilter)
      : undefined;

  return {
    query,
    datasource,
    filter,
    autoSelect: cli.flags.autoSelect,
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

export async function chooseDatasource(
  datasources: PlatformDatasourceFilterInfo[],
  requested: string | undefined,
  autoSelect: boolean,
  terminal: readline.Interface | undefined,
) {
  const first = datasources.at(0);
  if (!first) {
    throw new Error(
      'Search Filters returned no datasources visible to this user.',
    );
  }

  if (requested) {
    const selected = datasources.find(
      (datasource) => datasource.datasource === requested,
    );
    if (!selected) {
      throw new Error(
        `Datasource "${requested}" was not returned by Search Filters.`,
      );
    }
    return selected.datasource;
  }

  if (autoSelect) return first.datasource;
  if (!terminal) {
    throw new Error(
      'Pass --datasource when input is not interactive, or use --auto-select.',
    );
  }

  console.log('\nDatasources visible to you:');
  for (const [index, datasource] of datasources.entries()) {
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
    datasources,
  );
  return selected.datasource;
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
      `\n${datasource.datasource} returned no suggested values for this query; continuing with the discovered datasource filter only.`,
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
  datasource: string,
  filter: PlatformFilter | undefined,
) {
  console.log(`\nSearch scope: ${datasource}`);
  if (filter) {
    console.log(
      `Applied filter: ${filter.field} ${filter.operator ?? 'EQUALS'} ${filter.values.join(', ')}`,
    );
  }

  if (response.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of response.warnings) {
      console.log(`  ${warning.code}: ${warning.message}`);
    }
  }

  console.log(`\nResults (${response.results.length}):`);
  if (response.results.length === 0) {
    console.log('  No results matched this search.');
  }
  for (const [index, searchResult] of response.results.entries()) {
    console.log(
      `\n${index + 1}. ${searchResult.title} [${searchResult.datasource}]`,
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
    console.log(`\nNext cursor: ${response.next_cursor}`);
  }
  console.log(`\nRequest ID: ${response.request_id}`);
}
