import { apiRequest } from './browser-api';
export type CardSummary = { id: string; slug: string; display_name: string; job_title: string | null; company: string | null; is_published: boolean };
export type CardPage = { data: CardSummary[]; meta: { current_page: number; last_page: number; total: number } };
export function getCards(origin: string, page: number, signal: AbortSignal) {
  return apiRequest<CardPage>(origin, `/api/v1/cards?page=${page}`, { signal });
}
