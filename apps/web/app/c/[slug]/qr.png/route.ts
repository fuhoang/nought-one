import { fetchPublicCard } from '@/lib/public-card';
import { createCardQr } from '@/lib/qr';
import { noStoreHeaders } from '@/lib/site-config';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    if (!await fetchPublicCard(slug)) return new Response('This card is unavailable.', { status: 404, headers: noStoreHeaders });
    return new Response(new Uint8Array(await createCardQr(slug)), { headers: {
      ...noStoreHeaders, 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="${slug}-qr.png"`,
    } });
  } catch {
    return new Response('Unable to generate this QR code. Please try again.', { status: 503, headers: noStoreHeaders });
  }
}
