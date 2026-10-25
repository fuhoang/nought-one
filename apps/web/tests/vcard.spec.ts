import { test, expect } from '@playwright/test';
import { createVCard } from '../lib/vcard';
import type { PublicCard } from '../lib/public-card';

const card: PublicCard = { slug: 'jane-doe', display_name: 'Jane Doe', job_title: null, company: null, bio: null, email: null, phone: null, website: null, location: null, template_key: 'minimal', links: [], assets: [] };

test('minimal vCard has required fields and CRLF delimiters', () => {
  expect(createVCard(card, 'https://nought.one/c/jane-doe')).toBe('BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Jane Doe\r\nURL:https://nought.one/c/jane-doe\r\nEND:VCARD\r\n');
});

test('vCard escapes injected properties and folds UTF-8 without splitting characters', () => {
  const value = createVCard({ ...card, display_name: 'Jane, Doe; \\ Studio\r\nEMAIL:injected@example.com', bio: '🌍'.repeat(80), company: 'One;Two', links: [{ type: 'website', label: 'Unsafe', url: 'javascript:alert(1)' }] }, 'https://nought.one/c/jane-doe');
  const lines = value.split('\r\n');
  expect(lines.every(line => Buffer.byteLength(line) <= 75)).toBe(true);
  const unfolded = value.replace(/\r\n /g, '');
  expect(unfolded).toContain('FN:Jane\\, Doe\\; \\\\ Studio\\nEMAIL:injected@example.com');
  expect(unfolded).toContain('NOTE:' + '🌍'.repeat(80));
  expect(unfolded).not.toContain('\r\nEMAIL:');
  expect(unfolded).not.toContain('javascript:');
});
