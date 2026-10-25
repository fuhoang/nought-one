import { Suspense } from 'react';
import { connection } from 'next/server';
import { apiOrigin } from '@/lib/site-config';
import { Dashboard } from '@/components/dashboard/dashboard';
async function DashboardScreen() {
  await connection();
  return <Dashboard origin={apiOrigin().origin} />;
}
export default function DashboardPage() {
  return <Suspense fallback={<main className="card-state"><p role="status">Loading your dashboard…</p></main>}><DashboardScreen /></Suspense>;
}
