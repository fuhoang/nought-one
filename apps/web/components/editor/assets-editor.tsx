'use client';
/* eslint-disable @next/next/no-img-element -- Private images use authenticated no-store requests and temporary object URLs. */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { apiRequest } from '@/lib/browser-api';
import type { CardAsset } from '@/lib/cards';
import { errorMessage, type PanelProps } from './card-editor';
import type { Confirm } from './confirm-dialog';
function PrivateImage({ origin, cardId, asset, version, onUnauthorized }: PanelProps & { asset: CardAsset; version: number }) {
  const [source, setSource] = useState(''); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined;
    fetch(`${origin}/api/v1/cards/${cardId}/assets/${asset.id}/content?v=${version}`, { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) onUnauthorized();
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob(); if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [origin, cardId, asset.id, version, onUnauthorized]);
  return failed ? <p>Image preview unavailable.</p> : source ? <img src={source} alt={`Current ${asset.type}`} width={120} height={120} /> : <p role="status">Loading image…</p>;
}
async function validateImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (file.size > 2048 * 1024) throw new Error('Images must be 2 MB or smaller.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This file could not be read as an image.'); }
  const valid = bitmap.width >= 32 && bitmap.height >= 32 && bitmap.width <= 2048 && bitmap.height <= 2048;
  bitmap.close(); if (!valid) throw new Error('Image width and height must each be between 32 and 2048 pixels.');
}
export function AssetsEditor({ origin, cardId, initial, confirm, onUnauthorized, disabled, markDirty }: PanelProps & { initial: CardAsset[]; markDirty: (key: string, value: boolean) => void; confirm: Confirm; disabled: boolean }) {
  const [assets, setAssets] = useState(initial); const [versions, setVersions] = useState({ avatar: 0, logo: 0 });
  const [busy, setBusy] = useState(false); const running = useRef(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [failedUpload, setFailedUpload] = useState<{ file: File; type: CardAsset['type'] } | null>(null);
  const inputs = useRef<Partial<Record<CardAsset['type'], HTMLInputElement | null>>>({});
  useEffect(() => { markDirty('image-operation', busy || !!failedUpload); return () => markDirty('image-operation', false); }, [busy, failedUpload, markDirty]);
  async function upload(event: ChangeEvent<HTMLInputElement>, type: CardAsset['type']) {
    const file = event.currentTarget.files?.[0];
    if (file) await uploadFile(file, type);
  }
  async function uploadFile(file: File, type: CardAsset['type']) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError(''); setMessage(''); setFailedUpload(null);
    let validated = false;
    try {
      await validateImage(file); validated = true; const form = new FormData(); form.set('type', type); form.set('file', file);
      const { data } = await apiRequest<{ data: CardAsset }>(origin, `/api/v1/cards/${cardId}/assets`, { method: 'POST', data: form });
      setAssets(previous => [...previous.filter(item => item.type !== type), data]); setVersions(previous => ({ ...previous, [type]: previous[type] + 1 })); setMessage(`${type === 'avatar' ? 'Avatar' : 'Logo'} saved.`);
      if (inputs.current[type]) inputs.current[type]!.value = '';
    } catch (error) {
      if (validated) setFailedUpload({ file, type });
      setError(`${errorMessage(error, onUnauthorized)} Your existing image has not been removed by the editor.`);
    }
    finally { running.current = false; setBusy(false); }
  }
  async function remove(asset: CardAsset) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (!await confirm(`Remove ${asset.type}?`, 'This image will be removed from the card.', 'Remove image')) return;
      await apiRequest(origin, `/api/v1/cards/${cardId}/assets/${asset.id}`, { method: 'DELETE' }); setAssets(previous => previous.filter(item => item.id !== asset.id)); setMessage('Image removed.');
    } catch (error) { setError(errorMessage(error, onUnauthorized)); }
    finally { running.current = false; setBusy(false); }
  }
  return <section className="editor-section" aria-labelledby="images-heading"><h2 id="images-heading">Images</h2><p className="section-help">Choosing a file uploads and saves it immediately. Profile edits remain unsaved. JPEG, PNG or WebP; maximum 2 MB; width and height 32–2048 pixels.</p>
    <div className="editor-images">{(['avatar', 'logo'] as const).map(type => { const asset = assets.find(item => item.type === type);
      return <div key={type} className="editor-image"><h3>{type === 'avatar' ? 'Avatar' : 'Logo'}</h3><div className="editor-image-preview">{asset ? <PrivateImage key={`${asset.id}-${versions[type]}`} origin={origin} cardId={cardId} asset={asset} version={versions[type]} onUnauthorized={onUnauthorized} /> : <p>No {type} yet.</p>}</div>
        <label htmlFor={`upload-${type}`}>{asset ? 'Replace' : 'Upload'} {type}</label><input ref={element => { inputs.current[type] = element; }} id={`upload-${type}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || disabled} onChange={e => upload(e, type)} />
        {asset && <button className="button button-secondary" disabled={busy || disabled} onClick={() => remove(asset)}>Remove {type}</button>}
      </div>;
    })}</div><p role="alert" className="editor-feedback">{error}</p>{failedUpload && <div className="editor-actions"><button className="button button-secondary" disabled={busy || disabled} onClick={() => uploadFile(failedUpload.file, failedUpload.type)}>Retry {failedUpload.type} upload</button><button className="button button-secondary" disabled={busy || disabled} onClick={() => { if (inputs.current[failedUpload.type]) inputs.current[failedUpload.type]!.value = ''; setFailedUpload(null); setError(''); }}>Discard selected file</button></div>}<p role="status" className="editor-feedback">{busy ? 'Saving image change…' : message}</p>
  </section>;
}
