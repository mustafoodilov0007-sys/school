import { useState } from 'react';
import { formatTashkent } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, ReasonDialog, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

interface Row { id: string; status: 'open' | 'accepted' | 'rejected'; body: string; admin_note: string | null; created_at: string; student: string; class_name: string; exam_title: string; question_position: number | null }
const ST = { open: 'Ochiq', accepted: 'Qabul qilindi', rejected: 'Rad etildi' } as const;

export function ComplaintsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [act, setAct] = useState<{ row: Row; to: 'accepted' | 'rejected' } | null>(null);
  const d = useAsync(() => api<{ items: Row[] }>(`/api/admin/complaints${status ? `?status=${status}` : ''}`), [status]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Shikoyatlar</h1>
        <select className="input w-auto" aria-label="Holat" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Ochiq</option><option value="accepted">Qabul qilingan</option><option value="rejected">Rad etilgan</option><option value="">Hammasi</option>
        </select>
      </div>
      <p className="text-sm text-mute">"Qabul qilindi" — shikoyat asosli. Ball kerak bo'lsa, Imtihonlar → Natijalar → "Ballni o'zgartirish" yoki savolni bekor qiling; o'quvchiga izoh Telegram'ga yuboriladi.</p>
      {d.loading ? <Spinner /> : d.error || !d.data ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : d.data.items.length === 0 ? <Empty>Shikoyatlar yo'q.</Empty> : (
        <ul className="space-y-3">
          {d.data.items.map((c) => (
            <li key={c.id} className="card space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{c.student} <span className="font-normal text-mute">· {c.class_name} · {c.exam_title}{c.question_position !== null ? ` · ${c.question_position + 1}-savol` : ''}</span></b>
                <span className="text-sm">{ST[c.status]} · {formatTashkent(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
              {c.admin_note && <p className="text-sm text-mute">Izoh: {c.admin_note}</p>}
              {c.status === 'open' && (
                <div className="flex gap-2 pt-1">
                  <button className="btn-sm" onClick={() => setAct({ row: c, to: 'accepted' })}>Qabul qilish</button>
                  <button className="btn-sm" onClick={() => setAct({ row: c, to: 'rejected' })}>Rad etish</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {act && (
        <ReasonDialog title={act.to === 'accepted' ? 'Shikoyatni qabul qilish' : 'Shikoyatni rad etish'} hint="Izoh o'quvchiga Telegram orqali yuboriladi." confirmLabel="Saqlash" onClose={() => setAct(null)}
          onConfirm={async (note) => {
            try { await api(`/api/admin/complaints/${act.row.id}/resolve`, { method: 'POST', body: { status: act.to, note } }); toast('Saqlandi'); setAct(null); d.reload(); } catch (e) { toast(errMsg(e), 'err'); }
          }} />
      )}
    </div>
  );
}
