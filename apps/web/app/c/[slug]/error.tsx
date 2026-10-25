'use client';
export default function CardError({ retry }: { retry: () => void }) {
  return <main className="card-state"><span className="state-brand">nought.one</span><p className="eyebrow">A MOMENT, PLEASE</p><h1>We couldn’t<br />open this card.</h1><p>The connection is temporarily unavailable. Please try again.</p><button className="button button-primary" onClick={retry}>Try again</button></main>;
}
