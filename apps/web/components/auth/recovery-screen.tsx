import { connection } from 'next/server';
import { apiOrigin } from '@/lib/site-config';
import { RecoveryForm } from './recovery-form';
import { VerificationForm } from './verification-form';

export type RecoveryParams = Promise<Record<string, string | string[] | undefined>>;
export async function RecoveryScreen({ mode, searchParams }: { mode: 'forgot' | 'reset' | 'verify'; searchParams: RecoveryParams }) {
  await connection();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  if (mode === 'verify') return <VerificationForm origin={apiOrigin().origin} id={value('id')} hash={value('hash')} expires={value('expires')} signature={value('signature')} />;
  return <RecoveryForm origin={apiOrigin().origin} mode={mode} token={value('token')} email={value('email')} />;
}
