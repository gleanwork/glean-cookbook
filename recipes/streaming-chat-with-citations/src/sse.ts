export interface ServerSentEvent {
  event?: string;
  data: string;
  id?: string;
}

/** Reads SSE frames from a response body without assuming network chunk boundaries. */
export async function* readSseEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const frames = buffer.split(/\r\n\r\n|\n\n|\r\r/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const event = parseSseFrame(frame);
        if (event) yield event;
      }

      if (done) {
        const event = parseSseFrame(buffer);
        if (event) yield event;
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Parses one complete SSE frame. JSON decoding belongs to the caller. */
export function parseSseFrame(frame: string): ServerSentEvent | undefined {
  let event: string | undefined;
  let id: string | undefined;
  const data: string[] = [];

  for (const line of frame.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value =
      separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');

    if (field === 'event') event = value;
    else if (field === 'id') id = value;
    else if (field === 'data') data.push(value);
  }

  if (data.length === 0) return undefined;
  return { event, id, data: data.join('\n') };
}

export function parseSseData<T>(event: ServerSentEvent): T | undefined {
  if (event.data === '[DONE]') return undefined;
  try {
    return JSON.parse(event.data) as T;
  } catch {
    throw new Error(
      `Received invalid JSON in SSE event${event.event ? ` "${event.event}"` : ''}.`,
    );
  }
}
