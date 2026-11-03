'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
export type Confirm = (title: string, message: string, action?: string) => Promise<boolean>;
export function useConfirmation(locked = false) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [content, setContent] = useState<{ title: string; message: string; action: string } | null>(null);
  const confirm: Confirm = useCallback((title, message, action = 'Confirm') => {
    if (resolver.current) return Promise.resolve(false);
    trigger.current = document.activeElement as HTMLElement;
    setContent({ title, message, action });
    return new Promise<boolean>(resolve => { resolver.current = resolve; });
  }, []);
  useEffect(() => { if (content) dialog.current?.showModal(); }, [content]);
  useEffect(() => { if (locked) dialog.current?.close(); }, [locked]);
  useEffect(() => () => resolver.current?.(false), []);
  function finish(value: boolean) {
    resolver.current?.(value); resolver.current = null;
    dialog.current?.close(); setContent(null); setTimeout(() => trigger.current?.focus(), 0);
  }
  const modal = <dialog className="editor-dialog" ref={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-message" onClose={() => { if (resolver.current) finish(false); }} onCancel={event => { event.preventDefault(); finish(false); }}>
    {content && <><h2 id="confirm-title">{content.title}</h2><p id="confirm-message">{content.message}</p><div className="editor-actions"><button className="button button-secondary" autoFocus onClick={() => finish(false)}>Cancel</button><button className="button button-primary" onClick={() => finish(true)}>{content.action}</button></div></>}
  </dialog>;
  return { confirm, modal };
}
