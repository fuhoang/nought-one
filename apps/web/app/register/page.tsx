import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth/auth-screen';
export const metadata = { title: 'Create account | nought.one', robots: { index: false, follow: false } };
export default function RegisterPage() {
  return <Suspense fallback={<main className="card-state"><p role="status">Loading registration…</p></main>}><AuthScreen mode="register" /></Suspense>;
}
