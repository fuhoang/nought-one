import type { PublicCard } from './public-card';

function text(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function fold(line: string): string {
  let output = '', bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > 75) { output += '\r\n '; bytes = 1; }
    output += char;
    bytes += size;
  }
  return output;
}

function uri(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /[\r\n]/.test(value)) return null;
    return url.href;
  } catch { return null; }
}

export function createVCard(card: PublicCard, publicUrl: string): string {
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `FN:${text(card.display_name)}`];
  if (card.company) lines.push(`ORG:${text(card.company)}`);
  if (card.job_title) lines.push(`TITLE:${text(card.job_title)}`);
  if (card.phone) lines.push(`TEL;VALUE=text:${text(card.phone)}`);
  if (card.email) lines.push(`EMAIL:${text(card.email)}`);
  const urls = new Set([publicUrl, card.website, ...card.links.map(link => link.url)]);
  for (const url of urls) { const safe = url && uri(url); if (safe) lines.push(`URL:${safe}`); }
  const notes = [card.bio, card.location ? `Location: ${card.location}` : null].filter(Boolean).join('\n');
  if (notes) lines.push(`NOTE:${text(notes)}`);
  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n') + '\r\n';
}
