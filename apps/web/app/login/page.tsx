import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth/auth-screen';
export const metadata = { title: 'Sign in | nought.one', robots: { index: false, follow: false } };
export default function LoginPage() {
  return <Suspense fallback={<main className="card-state"><p role="status">Loading sign in…</p></main>}><AuthScreen mode="login" /></Suspense>;
}
