function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const markerIndex = lockPath.lastIndexOf(marker);
  return markerIndex === -1
    ? undefined
    : lockPath.slice(markerIndex + marker.length);
}

export function installScriptDependencies(lockfile) {
  return Object.entries(lockfile.packages ?? {}).flatMap(
    ([lockPath, dependency]) => {
      if (!dependency?.hasInstallScript || !dependency.version) return [];
      const name = packageNameFromLockPath(lockPath);
      return name ? [{ name, version: dependency.version }] : [];
    },
  );
}

export function installScriptPolicyErrors(packageJson, lockfile) {
  const dependencies = installScriptDependencies(lockfile);
  const policy = packageJson.allowScripts;
  const errors = [];

  if (policy !== undefined && (!policy || typeof policy !== 'object')) {
    return ['allowScripts must be an object whose values are booleans.'];
  }

  const entries = Object.entries(policy ?? {});
  for (const [key, value] of entries) {
    if (typeof value !== 'boolean') {
      errors.push(`allowScripts.${key} must be true or false.`);
    }
    if (
      value === true &&
      !dependencies.some(({ name, version }) => key === `${name}@${version}`)
    ) {
      errors.push(
        `allowScripts.${key} is not a pinned approval for an installed dependency.`,
      );
    }
  }

  for (const { name, version } of dependencies) {
    const pinnedKey = `${name}@${version}`;
    if (!(pinnedKey in (policy ?? {})) && !(name in (policy ?? {}))) {
      errors.push(
        `${pinnedKey} has an install script but is not approved or denied in allowScripts.`,
      );
    }
  }

  return errors;
}
