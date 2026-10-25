import { connection } from 'next/server';
import { apiOrigin } from '@/lib/site-config';
import { AuthForm } from './auth-form';
export async function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  await connection();
  return <AuthForm mode={mode} origin={apiOrigin().origin} />;
}
