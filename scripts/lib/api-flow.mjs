import { isDeepStrictEqual } from 'node:util';

import { readRecipeSource } from './recipe-source.mjs';

export const MAX_API_FLOW_BODY_BYTES = 8_000;

function fail(entry, message) {
  throw new Error(`${entry.id}: ${message}`);
}

/** Resolves an RFC 6901 JSON Pointer such as `/run/pending_interactions/0`. */
export function resolvePointer(document, pointer) {
  let current = document;
  for (const raw of pointer.split('/').slice(1)) {
    const token = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(token) || Number(token) >= current.length) {
        return { found: false };
      }
      current = current[Number(token)];
    } else if (
      current !== null &&
      typeof current === 'object' &&
      Object.hasOwn(current, token)
    ) {
      current = current[token];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

function readBody(entry, recipeDir, body, where) {
  if (body.body !== undefined) {
    fail(entry, `${where}.body is generated; set source instead`);
  }
  if (!body.source.endsWith('.json')) {
    fail(entry, `${where}.source must be a .json file: ${body.source}`);
  }
  const { text } = readRecipeSource(entry, recipeDir, body.source, {
    label: 'API flow',
    maxBytes: MAX_API_FLOW_BODY_BYTES,
  });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(entry, `API flow source is not valid JSON: ${body.source}`);
  }
  if (parsed === null || typeof parsed !== 'object') {
    fail(
      entry,
      `API flow source must be a JSON object or array: ${body.source}`,
    );
  }
  return { parsed, body: JSON.stringify(parsed, null, 2) };
}

/**
 * Materializes an API flow into the generated registry and checks that it
 * tells a true story. Every highlight must point at a real field; a path
 * parameter or request field that carries a value must name an input or a
 * value an earlier response returned, with the same example value; and every
 * returned value must be used by a later call.
 */
export function materializeApiFlow(entry, recipeDir) {
  const flow = entry.apiFlow;
  if (!flow) return entry;

  const inputs = new Set();
  for (const { value } of flow.inputs ?? []) {
    if (inputs.has(value))
      fail(entry, `apiFlow input ${value} is declared twice`);
    inputs.add(value);
  }
  const usedInputs = new Set();
  // The latest example of each value a response returned, and whether a later
  // call used it.
  const returned = new Map();

  const calls = flow.calls.map((call, index) => {
    const step = `apiFlow.calls[${index}]`;
    const request =
      call.request &&
      readBody(entry, recipeDir, call.request, `${step}.request`);
    const response = readBody(
      entry,
      recipeDir,
      call.response,
      `${step}.response`,
    );
    const params = [...call.path.matchAll(/\{([^{}]+)\}/g)].map(
      ([, name]) => name,
    );

    const seen = new Set();
    const highlightedParams = new Set();
    const produces = [];
    for (const highlight of call.highlights) {
      const at =
        highlight.in === 'path'
          ? `path {${highlight.param}}`
          : `${highlight.in} ${highlight.pointer}`;
      if (seen.has(at)) fail(entry, `${step} highlights ${at} twice`);
      seen.add(at);

      let example;
      if (highlight.in === 'path') {
        if (!params.includes(highlight.param)) {
          fail(entry, `${step}: ${call.path} has no {${highlight.param}}`);
        }
        highlightedParams.add(highlight.param);
      } else {
        const document =
          highlight.in === 'request' ? request?.parsed : response.parsed;
        if (!document) fail(entry, `${step} has no request body to highlight`);
        const resolved = resolvePointer(document, highlight.pointer);
        if (!resolved.found) fail(entry, `${step}: ${at} does not exist`);
        example = resolved.value;
      }

      const { value } = highlight;
      if (value === undefined) {
        if (highlight.note === undefined) {
          fail(entry, `${step}: ${at} needs a value to link or a note`);
        }
        continue;
      }
      if (highlight.in === 'response') {
        produces.push([value, example]);
      } else if (returned.has(value)) {
        const earlier = returned.get(value);
        earlier.used = true;
        if (
          highlight.in === 'request' &&
          !isDeepStrictEqual(example, earlier.example)
        ) {
          fail(
            entry,
            `${step}: ${at} is ${JSON.stringify(example)}, but the earlier response returned ${value} as ${JSON.stringify(earlier.example)}`,
          );
        }
      } else if (inputs.has(value)) {
        usedInputs.add(value);
      } else {
        fail(
          entry,
          `${step}: ${at} uses ${value}, but no earlier response returns it and apiFlow.inputs does not declare it`,
        );
      }
    }

    for (const param of params) {
      if (!highlightedParams.has(param)) {
        fail(
          entry,
          `${step}: highlight {${param}} so readers see where it comes from`,
        );
      }
    }
    // A response's values are available only to later calls.
    for (const [value, example] of produces) {
      returned.set(value, { example, used: false, step });
    }

    return {
      ...call,
      ...(request && { request: { ...call.request, body: request.body } }),
      response: { ...call.response, body: response.body },
    };
  });

  for (const [value, { used, step }] of returned) {
    if (!used) {
      fail(
        entry,
        `${step} returns ${value}, but no later call uses it; keep a note and drop the value`,
      );
    }
  }
  for (const value of inputs) {
    if (!usedInputs.has(value))
      fail(entry, `apiFlow input ${value} is never used`);
  }

  return { ...entry, apiFlow: { ...flow, calls } };
}
