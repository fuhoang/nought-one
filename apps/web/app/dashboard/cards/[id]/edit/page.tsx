import { Suspense } from 'react';
import { EditorScreen } from '@/components/editor/editor-screen';
export const metadata = { title: 'Edit card | nought.one' };
export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main className="card-state"><p role="status">Loading editor…</p></main>}><EditorScreen params={params} /></Suspense>;
}
