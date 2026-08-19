import fs from 'node:fs';

import Handlebars from 'handlebars';
import YAML from 'yaml';

const EXECUTION_TYPES = JSON.parse(
  fs.readFileSync(
    new URL('../../config/execution-types.json', import.meta.url),
    'utf8',
  ),
);

const AUTH_PARTIALS = {
  'web-sdk-cookie': 'auth-web-sdk-cookie',
  'client-api-oauth-or-token': 'auth-client-api',
  'indexing-token': 'auth-indexing-token',
};
const LANGUAGE_LABELS = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
};
const LABEL_WORDS = {
  sdk: 'SDK',
  api: 'API',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
};
const VARIANT_LABELS = { 'platform-chat': 'Client Chat' };

Handlebars.registerHelper(
  'pluginPartial',
  (name) => new Handlebars.SafeString(`{{> ${name}}}`),
);
Handlebars.registerHelper(
  'indent',
  (value, width) =>
    new Handlebars.SafeString(
      String(value)
        .split('\n')
        .map((line) => `${' '.repeat(width)}${line}`)
        .join('\n'),
    ),
);

const template = Handlebars.compile(
  fs.readFileSync(
    new URL('../templates/recipe-skill.md.hbs', import.meta.url),
    'utf8',
  ),
  { noEscape: true },
);
Handlebars.registerPartial(
  'execution',
  fs.readFileSync(
    new URL('../templates/execution.md.hbs', import.meta.url),
    'utf8',
  ),
);

function humanize(value) {
  const slug = value.split('/').at(-1);
  if (VARIANT_LABELS[slug]) return VARIANT_LABELS[slug];
  return slug
    .split('-')
    .map(
      (word) =>
        LABEL_WORDS[word] ?? word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function executionView(execution, steps = []) {
  if (!execution) {
    return {
      steps: steps.map((step, index) => ({
        ...step,
        number: index + 1,
      })),
    };
  }
  const descriptor = EXECUTION_TYPES[execution.type];
  if (!descriptor) throw new Error(`Unknown execution type: ${execution.type}`);
  const browserCookie = execution.auth.some(
    (auth) => auth.kind === 'browser-cookie',
  );
  const handoffPartial =
    browserCookie && descriptor.browserCookieHandoffPartial
      ? descriptor.browserCookieHandoffPartial
      : descriptor.handoffPartial;
  return {
    questions: execution.questions ?? [],
    oauth: execution.auth.some(
      (auth) => auth.kind === 'oauth-with-token-fallback',
    ),
    // Keyed on the auth kind, not authMethod: `custom` also covers n8n credentials
    // and plugin-managed OAuth, so keying on it would be wrong for most recipes.
    externalApiKey: execution.auth.some(
      (auth) => auth.kind === 'external-api-key',
    ),
    browserCookie,
    demo: steps.some((step) => step.kind === 'verify-fixture'),
    handoffPartial,
    steps: steps.map((step, index) => ({
      ...step,
      number: index + 1,
      handoffPartial: step.kind === 'run' ? handoffPartial : undefined,
    })),
  };
}

function scaffoldLabel(action) {
  return `Scaffold ${action
    .replace(/^scaffold-/, '')
    .split('-')
    .map((word) => ({ sdk: 'SDK', mcp: 'MCP' })[word] ?? word)
    .join(' ')}`;
}

export function renderRecipeSkill(recipe) {
  const variants = (recipe.codeAssets ?? []).filter(
    (asset) => asset.steps?.length > 0,
  );
  const structured = Boolean(
    (recipe.steps?.length > 0 || variants.length > 0) &&
    (recipe.execution ||
      (recipe.codeAssets ?? []).some((asset) => asset.execution)),
  );
  const rootSteps = recipe.steps?.length
    ? executionView(recipe.execution, recipe.steps)
    : undefined;
  const variantExecutions = variants.map((asset) => ({
    ...executionView(asset.execution, asset.steps),
    heading: humanize(asset.repoPath),
    description: asset.description,
  }));
  const beforeItems = [
    ...(!structured && recipe.requiredScopes?.length > 0
      ? [
          `Required API scopes (for paths that use API credentials): ${recipe.requiredScopes.map((scope) => `\`${scope}\``).join(', ')}`,
        ]
      : []),
    ...(recipe.prerequisites ?? []),
  ];
  const authBlocks = structured
    ? []
    : (recipe.authMethod ?? [])
        .filter((method) => AUTH_PARTIALS[method])
        .map((method, _index, methods) => ({
          heading: methods.length > 1 ? method : undefined,
          partial: AUTH_PARTIALS[method],
        }));
  const verifyPartials =
    recipe.buildMethod === 'third-party-build'
      ? ['verify-gate-third-party']
      : [
          ...(recipe.surfaces?.includes('web-sdk')
            ? ['verify-gate-web-sdk']
            : []),
          'verify-gate',
        ];
  const verify =
    !structured && recipe.demoQueries?.length > 0
      ? { partials: verifyPartials, queries: recipe.demoQueries }
      : undefined;

  return template({
    ...recipe,
    yamlDescription: YAML.stringify(recipe.description, {
      defaultStringType: 'QUOTE_DOUBLE',
      lineWidth: 0,
    }).trim(),
    structured,
    beforeItems,
    chooseVariant: variants.length > 1,
    rootSteps,
    variants: variantExecutions,
    rootExecution: executionView(recipe.execution),
    aiPrompt: recipe.aiPrompt?.trim(),
    setupItems: (recipe.scaffoldActions ?? []).map(scaffoldLabel),
    reference: !structured ? recipe.llmContext?.trim() : undefined,
    authBlocks,
    authChoice: authBlocks.length > 1,
    languagePrompt:
      recipe.languages?.length > 1
        ? `Ask me which language to build in before starting: ${recipe.languages.map((language) => LANGUAGE_LABELS[language]).join(', ')}.`
        : undefined,
    houseStyle: !structured && recipe.surfaces?.includes('web-sdk'),
    verify,
  });
}
