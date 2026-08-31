import tseslint from 'typescript-eslint';

// Scoped narrowly to deprecation detection — not a general lint pass. Catches
// usage of any @deprecated-tagged SDK symbol (e.g. the pinned
// @gleanwork/api-client's ChatMessage.citations) that tsc alone accepts
// silently.
export default tseslint.config({
  files: ['**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    '@typescript-eslint/no-deprecated': 'error',
  },
});
