'use client';
/* eslint-disable @next/next/no-img-element -- Direct image requests preserve Laravel's publication checks and no-store headers. */
import { useState } from 'react';

export function CardImage({ src, name, kind }: { src?: string; name: string; kind: 'avatar' | 'logo' }) {
  const [failed, setFailed] = useState(false);
  if (kind === 'logo' && (!src || failed)) return null;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  return <div className={`card-${kind}`}>
    {src && !failed
      ? <img src={src} alt={kind === 'avatar' ? `Portrait of ${name}` : `${name} logo`} width={kind === 'avatar' ? 120 : 48} height={kind === 'avatar' ? 120 : 48} onError={() => setFailed(true)} />
      : <span aria-label={`Initials for ${name}`}>{initials}</span>}
  </div>;
}
