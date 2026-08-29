import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Glean } from '@gleanwork/api-client';
import { formatSdkError } from './errors.js';
import {
  runSearchFlow,
  type DatasourceFilterInfo,
  type SelectedFilter,
} from './search.js';

interface CliOptions {
  query?: string;
  datasource?: string;
  field?: string;
  value?: string;
  automatic: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { automatic: false };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--query') options.query = args[++index];
    else if (arg === '--datasource') options.datasource = args[++index];
    else if (arg === '--field') options.field = args[++index];
    else if (arg === '--value') options.value = args[++index];
    else if (arg === '--automatic') options.automatic = true;
    else if (arg?.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (arg) positional.push(arg);
  }

  options.query ??= positional.join(' ');
  if (!options.query?.trim()) {
    throw new Error(
      'Pass a query with --query, for example: npm start -- --query "quarterly planning"',
    );
  }
  if (Boolean(options.field) !== Boolean(options.value)) {
    throw new Error('--field and --value must be provided together.');
  }
  return options;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function numberedDatasources(datasources: DatasourceFilterInfo[]): void {
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
}

async function chooseIndex(
  terminal: readline.Interface,
  prompt: string,
  count: number,
): Promise<number> {
  while (true) {
    const answer = (await terminal.question(prompt)).trim() || '1';
    const selected = Number(answer);
    if (Number.isInteger(selected) && selected >= 1 && selected <= count) {
      return selected - 1;
    }
    console.log(`Enter a number from 1 to ${count}.`);
  }
}

function suggestedFilters(
  datasource: DatasourceFilterInfo,
): Array<{ field: string; values: string[] }> {
  return datasource.filters
    .filter(
      (field) =>
        field.operators.includes('EQUALS') && (field.values?.length ?? 0) > 0,
    )
    .map((field) => ({
      field: field.field,
      values: [...new Set(field.values)],
    }));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  process.env.X_GLEAN_INCLUDE_EXPERIMENTAL = 'true';
  const glean = new Glean({
    serverURL: requireEnv('GLEAN_SERVER_URL'),
    apiToken: requireEnv('GLEAN_API_TOKEN'),
  });
  const terminal =
    !options.automatic && stdin.isTTY
      ? readline.createInterface({ input: stdin, output: stdout })
      : undefined;

  try {
    const result = await runSearchFlow(glean.search, options.query!, {
      async selectDatasource(datasources) {
        numberedDatasources(datasources);
        if (options.datasource) return options.datasource;
        if (!terminal) return datasources[0].datasource;
        const index = await chooseIndex(
          terminal,
          '\nChoose a datasource [1]: ',
          datasources.length,
        );
        return datasources[index].datasource;
      },
      async selectFilter(datasource): Promise<SelectedFilter | undefined> {
        if (options.field && options.value) {
          return { field: options.field, value: options.value };
        }

        const candidates = suggestedFilters(datasource);
        if (candidates.length === 0) {
          console.log(
            `\n${datasource.datasource} returned no suggested values for this query; continuing with the discovered datasource filter only.`,
          );
          return undefined;
        }

        if (!terminal) {
          return { field: candidates[0].field, value: candidates[0].values[0] };
        }

        console.log('\nSuggested fields and values for this query:');
        candidates.forEach((candidate, index) => {
          console.log(
            `  ${index + 1}. ${candidate.field} — ${candidate.values.slice(0, 5).join(', ')}`,
          );
        });
        const fieldIndex = await chooseIndex(
          terminal,
          '\nChoose a field [1]: ',
          candidates.length,
        );
        const candidate = candidates[fieldIndex];
        candidate.values.forEach((value, index) => {
          console.log(`  ${index + 1}. ${value}`);
        });
        const valueIndex = await chooseIndex(
          terminal,
          '\nChoose a value [1]: ',
          candidate.values.length,
        );
        return {
          field: candidate.field,
          value: candidate.values[valueIndex],
        };
      },
    });

    console.log(`\nSearch scope: ${result.datasource}`);
    if (result.filter) {
      console.log(
        `Applied filter: ${result.filter.field} EQUALS ${result.filter.value}`,
      );
    }

    if (result.response.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warning of result.response.warnings) {
        console.log(`  ${warning.code}: ${warning.message}`);
      }
    }

    console.log(`\nResults (${result.response.results.length}):`);
    if (result.response.results.length === 0) {
      console.log('  No results matched this query and filter.');
    }
    for (const [index, searchResult] of result.response.results.entries()) {
      console.log(
        `\n${index + 1}. ${searchResult.title} [${searchResult.datasource}]`,
      );
      console.log(`   ${searchResult.url}`);
      for (const snippet of searchResult.snippets?.slice(0, 2) ?? []) {
        console.log(`   ${snippet}`);
      }
    }

    if (result.response.has_more && result.response.next_cursor) {
      console.log(
        '\nMore results are available. Pass next_cursor as cursor in another POST /api/search request.',
      );
    }
    console.log(`\nRequest ID: ${result.response.request_id}`);
  } finally {
    terminal?.close();
  }
}

main().catch((error) => {
  console.error(formatSdkError(error));
  process.exit(1);
});
