export function stripFrameworkCompilerMetadata(entry) {
  if (!Array.isArray(entry.codeAssets)) return entry;
  return {
    ...entry,
    codeAssets: entry.codeAssets.map(
      ({ frameworkFeatures: _ignored, ...asset }) => asset,
    ),
  };
}
