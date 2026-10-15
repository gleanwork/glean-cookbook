export interface PersonReference {
  name: string;
  id?: string;
}

export interface DocumentContent {
  full_text_list: string[];
}

export interface Document {
  document_id: string;
  url: string;
  title: string;
  datasource: string;
  document_type: string | null;
  updated_at: string | null;
  created_at: string | null;
  mime_type?: string;
  creator?: PersonReference;
  owner?: PersonReference;
  content?: DocumentContent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Response field ${field} must be a non-empty string.`);
  }
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(
    `Response field ${field} must be a non-empty string or null.`,
  );
}

function readPerson(
  value: unknown,
  field: string,
): PersonReference | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`Response field ${field} must be an object.`);
  }
  const name = readRequiredString(value.name, `${field}.name`);
  if (value.id === undefined) return { name };
  if (typeof value.id !== 'string') {
    throw new Error(`Response field ${field}.id must be a string.`);
  }
  return { name, id: value.id };
}

function readStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Response field ${field} must be an array of strings.`);
  }
  const segments: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const segment: unknown = value[index];
    if (typeof segment !== 'string') {
      throw new Error(`Response field ${field} must be an array of strings.`);
    }
    segments.push(segment);
  }
  return segments;
}

function readContent(
  value: unknown,
  field: string,
  required: boolean,
): DocumentContent | undefined {
  if (value === undefined) {
    if (required) {
      throw new Error(
        `Response is missing ${field}. include=CONTENT requires content on every found document.`,
      );
    }
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Response field ${field} must be an object.`);
  }
  return {
    full_text_list: readStringList(
      value.full_text_list,
      `${field}.full_text_list`,
    ),
  };
}

export function readDocument(
  value: unknown,
  field: string,
  includeContent: boolean,
): Document {
  if (!isRecord(value)) {
    throw new Error(`Response field ${field} must be an object.`);
  }
  const mimeType = value.mime_type;
  if (
    mimeType !== undefined &&
    (typeof mimeType !== 'string' || mimeType.length === 0)
  ) {
    throw new Error(
      `Response field ${field}.mime_type must be a non-empty string.`,
    );
  }
  const content = readContent(
    value.content,
    `${field}.content`,
    includeContent,
  );
  return {
    document_id: readRequiredString(value.document_id, `${field}.document_id`),
    url: readRequiredString(value.url, `${field}.url`),
    title: readRequiredString(value.title, `${field}.title`),
    datasource: readRequiredString(value.datasource, `${field}.datasource`),
    document_type: readNullableString(
      value.document_type,
      `${field}.document_type`,
    ),
    updated_at: readNullableString(value.updated_at, `${field}.updated_at`),
    created_at: readNullableString(value.created_at, `${field}.created_at`),
    ...(typeof mimeType === 'string' ? { mime_type: mimeType } : {}),
    ...(value.creator === undefined
      ? {}
      : { creator: readPerson(value.creator, `${field}.creator`) }),
    ...(value.owner === undefined
      ? {}
      : { owner: readPerson(value.owner, `${field}.owner`) }),
    ...(content ? { content } : {}),
  };
}

export const MAX_DOCUMENT_SPECS = 100;

export type DocumentSpec = { document_id: string } | { url: string };

export interface DocumentsBatchRequest {
  document_specs: DocumentSpec[];
  include?: ['CONTENT'];
}

export interface DocumentsBatchResult {
  index: number;
  document: Document;
}

export interface DocumentsBatchWarning {
  code: string;
  message: string;
  context: {
    index: number;
    document_id?: string;
    url?: string;
  };
}

export interface DocumentsBatchResponse {
  results: DocumentsBatchResult[];
  warnings: DocumentsBatchWarning[];
  request_id: string;
}

export function assertDocumentSpecs(specs: readonly DocumentSpec[]): void {
  if (specs.length < 1 || specs.length > MAX_DOCUMENT_SPECS) {
    throw new Error(
      `Send 1 to 100 document_specs. This request has ${specs.length}.`,
    );
  }
  specs.forEach((spec, index) => {
    const keys = Object.keys(spec);
    if (keys.length !== 1) {
      throw new Error(
        `document_specs[${index}] must be exactly one of document_id or url.`,
      );
    }
    if ('document_id' in spec) {
      if (spec.document_id.trim() === '') {
        throw new Error(
          `document_specs[${index}].document_id must not be blank.`,
        );
      }
      return;
    }
    if ('url' in spec) return;
    const unreachable: never = spec;
    throw new Error(
      `document_specs[${index}] is not a document_id or url selector: ${JSON.stringify(unreachable)}`,
    );
  });
}

export function batchRequest(
  specs: readonly DocumentSpec[],
  includeContent: boolean,
): DocumentsBatchRequest {
  assertDocumentSpecs(specs);
  const documentSpecs = specs.map((spec) =>
    'document_id' in spec
      ? { document_id: spec.document_id }
      : { url: spec.url },
  );
  return includeContent
    ? { document_specs: documentSpecs, include: ['CONTENT'] }
    : { document_specs: documentSpecs };
}

function readIndex(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Response field ${field} must be a non-negative integer.`);
  }
  return value;
}

function readWarning(value: unknown, position: number): DocumentsBatchWarning {
  if (!isRecord(value)) {
    throw new Error(`Response field warnings[${position}] must be an object.`);
  }
  if (!isRecord(value.context)) {
    throw new Error(
      `Response field warnings[${position}].context must be an object.`,
    );
  }
  const documentId = value.context.document_id;
  const url = value.context.url;
  if (
    documentId !== undefined &&
    (typeof documentId !== 'string' || documentId.length === 0)
  ) {
    throw new Error(
      `Response field warnings[${position}].context.document_id must be a non-empty string.`,
    );
  }
  if (url !== undefined && typeof url !== 'string') {
    throw new Error(
      `Response field warnings[${position}].context.url must be a string.`,
    );
  }
  return {
    code: readRequiredString(value.code, `warnings[${position}].code`),
    message: readRequiredString(value.message, `warnings[${position}].message`),
    context: {
      index: readIndex(
        value.context.index,
        `warnings[${position}].context.index`,
      ),
      ...(typeof documentId === 'string' ? { document_id: documentId } : {}),
      ...(typeof url === 'string' ? { url } : {}),
    },
  };
}

export function readDocumentsBatchResponse(
  body: unknown,
  includeContent: boolean,
): DocumentsBatchResponse {
  if (!isRecord(body)) {
    throw new Error('Batch response must be a JSON object.');
  }
  if (!Array.isArray(body.results) || !Array.isArray(body.warnings)) {
    throw new Error('Batch response must include results and warnings arrays.');
  }
  return {
    request_id: readRequiredString(body.request_id, 'request_id'),
    results: body.results.map((result, position) => {
      if (!isRecord(result)) {
        throw new Error(
          `Response field results[${position}] must be an object.`,
        );
      }
      return {
        index: readIndex(result.index, `results[${position}].index`),
        document: readDocument(
          result.document,
          `results[${position}].document`,
          includeContent,
        ),
      };
    }),
    warnings: body.warnings.map((warning, position) =>
      readWarning(warning, position),
    ),
  };
}

export function assertBatchCoverage(
  specCount: number,
  response: DocumentsBatchResponse,
): void {
  const seen = new Set<number>();
  const claim = (index: number, source: string) => {
    if (index >= specCount) {
      throw new Error(`${source} index ${index} is outside document_specs.`);
    }
    if (seen.has(index)) {
      throw new Error(`document_specs index ${index} appears more than once.`);
    }
    seen.add(index);
  };
  for (const result of response.results) claim(result.index, 'Result');
  for (const warning of response.warnings) {
    claim(warning.context.index, 'Warning');
  }
  for (let index = 0; index < specCount; index += 1) {
    if (!seen.has(index)) {
      throw new Error(
        `The batch response omitted document_specs index ${index}.`,
      );
    }
  }
}

export function formatBatch(
  response: DocumentsBatchResponse,
  specCount: number,
  includeContent: boolean,
): string {
  const lines = [
    `Retrieved ${response.results.length} of ${specCount} documents.`,
    `request_id: ${response.request_id}`,
    'results:',
  ];
  if (response.results.length === 0) lines.push('  (none)');
  for (const result of response.results) {
    const document = result.document;
    lines.push(
      `  [${result.index}] ${document.title} (${document.document_id}) ${document.url}`,
    );
    if (includeContent) {
      const count = document.content?.full_text_list.length ?? 0;
      lines.push(`      content_segments: ${count}`);
    }
  }
  lines.push('warnings:');
  if (response.warnings.length === 0) lines.push('  (none)');
  for (const warning of response.warnings) {
    const selector =
      warning.context.document_id !== undefined
        ? `document_id=${warning.context.document_id}`
        : warning.context.url !== undefined
          ? `url=${warning.context.url}`
          : '';
    lines.push(
      `  [${warning.context.index}] ${warning.code}: ${warning.message}${selector ? ` ${selector}` : ''}`,
    );
  }
  return lines.join('\n');
}
