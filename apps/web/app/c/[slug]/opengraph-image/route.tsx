import { ImageResponse } from 'next/og';
import { fetchPublicCard } from '@/lib/public-card';
import { noStoreHeaders } from '@/lib/site-config';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const card = await fetchPublicCard(slug);
    if (!card) return new Response('This card is unavailable.', { status: 404, headers: noStoreHeaders });
    return new ImageResponse(
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '64px 80px', background: '#f5f5f3', color: '#111', justifyContent: 'space-between', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: '-1px' }}>nought.one</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontSize: 78, letterSpacing: '-4px', lineHeight: 1.05 }}>{card.display_name.slice(0, 70)}</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#555' }}>{[card.job_title, card.company].filter(Boolean).join(' · ').slice(0, 100)}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 22, borderTop: '1px solid #bbb', paddingTop: 24 }}>A simple way to stay connected.</div>
      </div>,
      { width: 1200, height: 630, headers: noStoreHeaders },
    );
  } catch {
    return new Response('Preview unavailable.', { status: 503, headers: noStoreHeaders });
  }
}
