export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string[]> = {}) { super(message); }
}

export async function apiRequest<T>(origin: string, path: string, options: { method?: 'GET' | 'POST'; data?: Record<string, string>; signal?: AbortSignal } = {}): Promise<T> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  async function send(target: string, method = 'GET', token?: string) {
    try {
      return await fetch(`${origin}${target}`, {
        method, credentials: 'include', cache: 'no-store', signal,
        headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token ?? '' } : {}) },
        ...(method !== 'GET' ? { body: JSON.stringify(options.data ?? {}) } : {}),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ApiError(0, 'We couldn’t reach the service. Please try again.');
    }
  }
  async function csrf() {
    const response = await send('/sanctum/csrf-cookie');
    if (!response.ok) throw new ApiError(response.status, 'We couldn’t start a secure session. Please try again.');
    const cookie = document.cookie.split('; ').find(item => item.startsWith('XSRF-TOKEN='));
    if (!cookie) throw new ApiError(419, 'Cookies are needed to sign in. Allow cookies and try again.');
    return decodeURIComponent(cookie.slice('XSRF-TOKEN='.length));
  }
  const method = options.method ?? 'GET';
  let response = await send(path, method, method === 'POST' ? await csrf() : undefined);
  // A 419 is rejected before the write runs. Do not retry other failed writes.
  if (method === 'POST' && response.status === 419) response = await send(path, method, await csrf());
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const fields: Record<string, string[]> = {};
    if (response.status === 422 && body?.errors && typeof body.errors === 'object') {
      for (const [key, value] of Object.entries(body.errors)) {
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) fields[key] = value;
      }
    }
    const message = response.status === 401 ? 'Your session has ended. Please sign in again.'
      : response.status === 419 ? 'Your secure session changed. Please try again.'
      : response.status === 429 ? 'Too many attempts. Please wait a minute and try again.'
      : response.status === 422 ? (Object.keys(fields).length ? 'Please check the highlighted fields.' : 'Invalid email or password.')
      : 'Something went wrong. Please try again.';
    throw new ApiError(response.status, message, fields);
  }
  return body as T;
}
