'use client';
/* eslint-disable @next/next/no-img-element -- QR responses must be fetched directly without image optimization caching. */
import { useRef, useState } from 'react';

export function ShareActions({ slug, publicUrl, name }: { slug: string; publicUrl: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState<'contact' | 'qr' | null>(null);
  const [qrSource, setQrSource] = useState('');
  const [qrError, setQrError] = useState(false);
  const path = `/c/${encodeURIComponent(slug)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyFailed(false);
      setMessage('Link copied. Ready to share.');
    } catch {
      setCopyFailed(true);
      setMessage('Copy is unavailable here. Select and copy the link below.');
    }
  }

  async function download(kind: 'contact' | 'qr') {
    const feedback = kind === 'qr' ? setDialogMessage : setMessage;
    setBusy(kind);
    feedback(kind === 'qr' ? 'Preparing QR code…' : 'Preparing contact…');
    try {
      const response = await fetch(`${path}/${kind === 'qr' ? 'qr.png' : 'contact.vcf'}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 404 ? 'This card is no longer available.' : 'Download failed. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = kind === 'qr' ? `${slug}-qr.png` : `${slug}.vcf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback(kind === 'qr' ? 'QR code downloaded.' : 'Contact downloaded. Open the file to save it.');
    } catch (error) {
      feedback(error instanceof Error ? error.message : 'Download failed. Please try again.');
    } finally { setBusy(null); }
  }

  function loadQr() {
    setQrError(false);
    setQrSource(`${path}/qr.png?v=${Date.now()}`);
  }

  return <section className="card-actions" aria-label="Save and share">
    <button className="button button-primary save-contact" onClick={() => download('contact')} disabled={busy !== null}>
      <span aria-hidden="true">＋</span> {busy === 'contact' ? 'Preparing contact…' : 'Save contact'}
    </button>
    <div className="share-row">
      <button className="button button-secondary" onClick={copyLink}>Copy link <span aria-hidden="true">↗</span></button>
      <button ref={trigger} className="button button-secondary" aria-haspopup="dialog" onClick={() => {
        setDialogMessage(''); loadQr(); dialog.current?.showModal();
      }}>Show QR code <span aria-hidden="true">▦</span></button>
    </div>
    <p className="action-feedback" role="status" aria-live="polite">{message}</p>
    {copyFailed && <label className="copy-fallback">Card link<input readOnly value={publicUrl} onFocus={event => event.currentTarget.select()} /></label>}
    <dialog ref={dialog} className="qr-dialog" aria-labelledby="qr-heading" onClose={() => trigger.current?.focus()}>
      <div className="dialog-top"><span className="eyebrow">STAY CONNECTED</span><button className="icon-button" aria-label="Close QR code" onClick={() => dialog.current?.close()}>×</button></div>
      <h2 id="qr-heading">A connection,<br />one scan away.</h2>
      <p>Scan to open {name}’s card.</p>
      <div className="qr-frame">{qrError
        ? <div role="alert"><p>The QR code is unavailable. The card may have been unpublished.</p><button className="button button-secondary" onClick={loadQr}>Try again</button></div>
        : qrSource && <img src={qrSource} width="256" height="256" alt={`QR code for ${name}’s public card`} onError={() => setQrError(true)} />}
      </div>
      <p className="qr-url">{publicUrl}</p>
      <button className="button button-primary" onClick={() => download('qr')} disabled={busy !== null || qrError}>{busy === 'qr' ? 'Preparing QR code…' : 'Download QR code'}</button>
      <p className="action-feedback" role="status" aria-live="polite">{dialogMessage}</p>
    </dialog>
  </section>;
}
