'use client';
import { useEffect, useState } from 'react';
import type { CardAsset } from '@/lib/cards';
import { CardImage } from '../public-card/card-image';

// Both editor surfaces use the authenticated endpoint, never a public draft URL.
export function PrivateCardImage({ origin, cardId, asset, version, onUnauthorized, name, alt }: { origin: string; cardId: string; asset: CardAsset; version: number; onUnauthorized: () => void; name: string; alt?: string }) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined;
    fetch(`${origin}/api/v1/cards/${cardId}/assets/${asset.id}/content?v=${version}`, { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) onUnauthorized();
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob(); if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [origin, cardId, asset.id, version, onUnauthorized]);
  return <div className="private-image"><CardImage key={source || 'fallback'} src={source || undefined} name={name} alt={alt} kind={asset.type} />{!source && <span className="sr-only" role="status">{failed ? 'Image preview unavailable.' : 'Loading image…'}</span>}</div>;
}
