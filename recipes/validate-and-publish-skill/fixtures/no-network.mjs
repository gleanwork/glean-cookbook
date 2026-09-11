// Imported only by CLI tests. A unit test must never discover a tenant or call Glean.
globalThis.fetch = async () => {
  throw new Error('Network access is disabled in offline tests.');
};
