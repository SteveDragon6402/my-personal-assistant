import type { Newsletter } from '../../ports/EmailPort.js';

export interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
}

export interface GmailPayload {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string };
  parts?: GmailPayload[];
}

export function extractNewsletter(message: GmailMessage): Newsletter | null {
  const payload = message.payload;
  if (!payload) {
    return null;
  }

  const subject = getHeader(payload.headers, 'Subject') ?? 'Untitled';
  const sender = getHeader(payload.headers, 'From') ?? 'Unknown sender';
  const dateHeader = getHeader(payload.headers, 'Date');
  const listUnsubscribe = getHeader(payload.headers, 'List-Unsubscribe');
  const listId = getHeader(payload.headers, 'List-Id');

  const isNewsletter = Boolean(listUnsubscribe || listId);
  if (!isNewsletter) {
    return null;
  }

  const receivedAt = dateHeader ? new Date(dateHeader) : new Date(Number(message.internalDate));
  const body = extractBody(payload) ?? message.snippet ?? '';
  const url = extractUrl(listUnsubscribe);

  return {
    id: message.id,
    subject: subject.trim(),
    sender: sender.trim(),
    body: body.trim(),
    receivedAt,
    url: url ?? undefined,
  };
}

function getHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string | null {
  if (!headers) {
    return null;
  }
  const header = headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function extractBody(payload: GmailPayload): string | null {
  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function decodeBase64(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const buffer = Buffer.from(normalized, 'base64');
  return buffer.toString('utf8');
}

function extractUrl(listUnsubscribe: string | null): string | null {
  if (!listUnsubscribe) {
    return null;
  }
  const match = listUnsubscribe.match(/https?:\/\/[^>]+/);
  return match ? match[0] : null;
}
