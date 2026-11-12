import { test, expect } from '@playwright/test';
import { apiRequest, ApiError } from '../lib/browser-api';

for (const name of ['XSRF-TOKEN-STAGING', 'XSRF-TOKEN-PRODUCTION', 'XSRF-TOKEN']) {
  test(`writes select ${name} among overlapping environment cookies`, async () => {
    const originalFetch = globalThis.fetch;
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      cookie: 'XSRF-TOKEN=legacy%3D; XSRF-TOKEN-PRODUCTION=prod%3D; XSRF-TOKEN-STAGING=stage%3D',
    } });
    const requests: RequestInit[] = [];
    globalThis.fetch = async (_url, options) => {
      requests.push(options!);
      if (requests.length === 1) return new Response(null, { status: 204, headers: name === 'XSRF-TOKEN' ? {} : { 'X-CSRF-Cookie-Name': name } });
      return new Response(null, { status: 204 });
    };
    try {
      await apiRequest('https://api.example.com', '/logout', { method: 'POST' });
      expect(new Headers(requests[1].headers).get('X-XSRF-TOKEN')).toBe(name === 'XSRF-TOKEN-STAGING' ? 'stage=' : name === 'XSRF-TOKEN-PRODUCTION' ? 'prod=' : 'legacy=');
      expect(requests.every(request => request.credentials === 'include')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });
}

test('missing environment cookie does not fall back to another environment', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'XSRF-TOKEN=other' } });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 204, headers: { 'X-CSRF-Cookie-Name': 'XSRF-TOKEN-STAGING' } }); };
  try {
    await expect(apiRequest('https://api.example.com', '/logout', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
