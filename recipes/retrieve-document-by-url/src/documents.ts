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

export interface DocumentGetResponse {
  document: Document;
  request_id: string;
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

export function readDocumentGetResponse(
  body: unknown,
  includeContent: boolean,
): DocumentGetResponse {
  if (!isRecord(body)) {
    throw new Error('Document response must be a JSON object.');
  }
  return {
    request_id: readRequiredString(body.request_id, 'request_id'),
    document: readDocument(body.document, 'document', includeContent),
  };
}

export function formatRetrieval(input: {
  submittedUrl: string;
  byUrl: DocumentGetResponse;
  byId: DocumentGetResponse;
  includeContent: boolean;
}): string {
  const document = input.byUrl.document;
  const lines = [
    `Retrieved ${document.title}`,
    `document_id: ${document.document_id}`,
    `url: ${document.url}`,
  ];
  if (document.url !== input.submittedUrl) {
    lines.push(`submitted_url: ${input.submittedUrl}`);
    lines.push('The permalink differs from the submitted URL.');
  }
  lines.push(
    `datasource: ${document.datasource}`,
    `document_type: ${document.document_type ?? 'null'}`,
    `updated_at: ${document.updated_at ?? 'null'}`,
    `created_at: ${document.created_at ?? 'null'}`,
  );
  if (document.mime_type) lines.push(`mime_type: ${document.mime_type}`);
  if (document.creator) lines.push(`creator: ${document.creator.name}`);
  if (document.owner) lines.push(`owner: ${document.owner.name}`);
  if (input.includeContent) {
    const segments = document.content?.full_text_list ?? [];
    lines.push(`content_segments: ${segments.length}`);
    const preview = segments.find((segment) => segment.trim().length > 0);
    lines.push(
      preview
        ? `content_preview: ${preview.slice(0, 240)}`
        : 'content: no extracted text',
    );
  }
  lines.push(`url_request_id: ${input.byUrl.request_id}`);
  lines.push(
    `Round-trip document_id matches (request ${input.byId.request_id}).`,
  );
  return lines.join('\n');
}
