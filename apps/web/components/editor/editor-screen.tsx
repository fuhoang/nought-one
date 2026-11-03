import { connection } from 'next/server';
import { apiOrigin, siteOrigin } from '@/lib/site-config';
import { EditorSession } from './editor-session';
export async function EditorScreen({ params }: { params?: Promise<{ id: string }> }) {
  await connection();
  const id = params ? (await params).id : undefined;
  return <EditorSession origin={apiOrigin().origin} site={siteOrigin().origin} id={id} />;
}
