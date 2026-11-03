import { apiRequest } from './browser-api';
export type CardSummary = { id: string; slug: string; display_name: string; job_title: string | null; company: string | null; is_published: boolean };
export type CardPage = { data: CardSummary[]; meta: { current_page: number; last_page: number; total: number } };
export function getCards(origin: string, page: number, signal: AbortSignal) {
  return apiRequest<CardPage>(origin, `/api/v1/cards?page=${page}`, { signal });
}

export type CardLink = { id: string; type: string; label: string; url: string; position: number; is_visible: boolean };
export type CardAsset = { id: string; type: 'avatar' | 'logo'; mime_type: string; file_size: number; url: string };
export type Card = CardSummary & { bio: string | null; phone: string | null; email: string | null; website: string | null; location: string | null; template_key: string; links: CardLink[]; assets: CardAsset[] };
export const profileFields = ['display_name', 'slug', 'job_title', 'company', 'bio', 'phone', 'email', 'website', 'location'] as const;
export type ProfileDraft = Record<typeof profileFields[number], string>;
export function profileDraft(card?: Card): ProfileDraft {
  return Object.fromEntries(profileFields.map(field => [field, card?.[field] ?? ''])) as ProfileDraft;
}
