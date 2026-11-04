import { Suspense } from 'react';
import { RecoveryScreen, type RecoveryParams } from '@/components/auth/recovery-screen';
export const metadata = { title: 'Forgot password | nought.one', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default function Page({ searchParams }: { searchParams: RecoveryParams }) {
  return <Suspense fallback={<main className="card-state"><p role="status">Loading…</p></main>}><RecoveryScreen mode="forgot" searchParams={searchParams} /></Suspense>;
}
