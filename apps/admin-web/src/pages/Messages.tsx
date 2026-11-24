import { useState } from 'react';
import type { ClassDto } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

export function MessagesPage() {
  const toast = useToast();
  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (classes.loading) return <Spinner />;
  if (classes.error) return <p role="alert" className="text-danger">{errMsg(classes.error)}</p>;
  const send = async () => {
    if (!window.confirm(`${picked.length} ta sinfga xabar yuboriladi. Davom etasizmi?`)) return;
    setBusy(true);
    try {
      const r = await api<{ queued: number; withoutTelegram: number }>('/api/admin/broadcast', { method: 'POST', body: { classIds: picked, studentIds: [], text } });
      toast(`Navbatga qo'yildi: ${r.queued} ta. Telegram'ga bog'lanmagan: ${r.withoutTelegram} ta.`);
      setText('');
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const ok = picked.length > 0 && text.trim().length > 0 && !busy;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Xabar yuborish</h1>
      <div className="card space-y-3">
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Sinflar</legend>
          <div className="flex flex-wrap gap-3">
            {classes.data?.items.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} /> {c.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">Xabar matni
          <textarea className="input mt-1 min-h-32" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="text-xs font-normal text-mute">{text.length}/1000 · Telegram bot orqali, bir necha soniyada yetkaziladi. Faqat Telegram'ga bog'langan o'quvchilarga boradi.</span>
        </label>
        <button className="btn" disabled={!ok} style={{ opacity: ok ? 1 : 0.5 }} onClick={() => void send()}>Yuborish</button>
      </div>
    </div>
  );
}
