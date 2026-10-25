import { fetchPublicCard } from '@/lib/public-card';
import { cardUrl, noStoreHeaders } from '@/lib/site-config';
import { createVCard } from '@/lib/vcard';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const card = await fetchPublicCard(slug);
    if (!card) return new Response('This card is unavailable.', { status: 404, headers: noStoreHeaders });
    return new Response(createVCard(card, cardUrl(slug)), { headers: {
      ...noStoreHeaders, 'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}.vcf"`,
    } });
  } catch {
    return new Response('Unable to download this contact. Please try again.', { status: 503, headers: noStoreHeaders });
  }
}
