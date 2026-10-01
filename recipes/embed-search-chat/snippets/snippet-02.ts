import { renderSearchBox, renderSearchResults } from '@gleanwork/web-sdk';

const commonOptions = {
  backend: 'https://{your}-be.glean.com',
  webAppUrl: 'https://{your}.glean.com',
  authMethod: 'sso' as const,
};

let currentQuery = '';

function renderResults(query: string): void {
  currentQuery = query;
  resultsElement.replaceChildren();
  renderSearchResults(resultsElement, {
    ...commonOptions,
    query: currentQuery,
    onSearch: renderResults,
  });
}

renderSearchBox(searchBoxElement, {
  ...commonOptions,
  onSearch: renderResults,
});
renderResults(currentQuery);
