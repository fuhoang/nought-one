import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicCard } from '@/lib/public-card';
import { cardUrl } from '@/lib/site-config';
import { Profile } from '@/components/public-card/profile';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = await getPublicCard(slug);
  if (!card) return { title: 'Card unavailable | nought.one', robots: { index: false, follow: false } };
  const title = `${card.display_name} | nought.one`;
  const description = (card.bio || [card.job_title, card.company].filter(Boolean).join(' at ') || `Connect with ${card.display_name}.`).slice(0, 180);
  const url = cardUrl(slug);
  const image = `${url}/opengraph-image`;
  return {
    title, description, alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: 'profile', title, description, url, siteName: 'nought.one', images: [{ url: image, width: 1200, height: 630, alt: `${card.display_name}’s digital business card` }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function CardPage({ params }: Props) {
  const { slug } = await params;
  const card = await getPublicCard(slug);
  if (!card) notFound();
  return <Profile card={card} publicUrl={cardUrl(card.slug)} />;
}
