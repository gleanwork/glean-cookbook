import type { DocumentsClient } from './client.js';
import type { DocumentGetResponse } from './documents.js';
import { DocumentsApiError } from './errors.js';

export async function retrieveDocumentByUrl(
  client: DocumentsClient,
  input: { url: string; includeContent: boolean },
): Promise<{ byUrl: DocumentGetResponse; byId: DocumentGetResponse }> {
  const byUrl = await client.getDocumentByUrl(input.url, input.includeContent);
  const documentId = byUrl.document.document_id;
  let byId: DocumentGetResponse;
  try {
    byId = await client.getDocumentById(documentId, input.includeContent);
  } catch (error) {
    if (error instanceof DocumentsApiError) {
      throw new Error(
        `Retrieved document_id ${documentId} by URL (request ${byUrl.request_id}), but get by ID failed.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (byId.document.document_id !== documentId) {
    throw new Error(
      `Get by ID returned document_id ${byId.document.document_id}, which does not match ${documentId} from the URL lookup (request ${byUrl.request_id}).`,
    );
  }
  return { byUrl, byId };
}
