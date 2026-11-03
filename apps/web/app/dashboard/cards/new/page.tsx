import { Suspense } from 'react';
import { EditorScreen } from '@/components/editor/editor-screen';
export const metadata = { title: 'Create card | nought.one' };
export default function NewCardPage() {
  return <Suspense fallback={<main className="card-state"><p role="status">Loading editor…</p></main>}><EditorScreen /></Suspense>;
}
