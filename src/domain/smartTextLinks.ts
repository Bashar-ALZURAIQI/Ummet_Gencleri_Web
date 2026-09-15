export interface SmartLinkToken {
  type: 'text' | 'link';
  value: string;
  href?: string;
}

const EMAIL_RE = /([A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+)/gi;
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]）]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|edu|gov|info|io|ai|tr|sa|eg|ae|dev|me)(?::\d{2,5})?(?:[/?#][^\s<>"')\]）]*)?)/gi;

function trimTail(value: string): string {
  let end = value.length;
  while (end > 0 && !/[A-Za-z0-9/]/.test(value[end - 1])) end -= 1;
  return value.slice(0, end);
}

function normalizeHref(token: string, email: boolean): string {
  if (email) return `mailto:${token}`;
  if (/^https?:\/\//i.test(token)) return token;
  return `https://${token}`;
}

export function tokenizeSmartText(text: string): SmartLinkToken[] {
  const tokens: SmartLinkToken[] = [];
  const source = String(text ?? '');
  let cursor = 0;
  const re = new RegExp(`${EMAIL_RE.source}|${URL_RE.source}`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (match.index > cursor) tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
    const email = Boolean(match[1]);
    const trimmed = trimTail(match[0]);
    if (trimmed.length > 0) {
      tokens.push({ type: 'link', value: trimmed, href: normalizeHref(trimmed, email) });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
  return tokens;
}