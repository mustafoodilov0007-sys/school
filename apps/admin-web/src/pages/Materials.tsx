import { useState } from 'react';
import type { ClassDto } from '@pep/shared';
import { formatTashkent, isoToTashkentLocal, tashkentLocalToIso } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, Modal, Spinner, useAsync } from '../components/ui';
import { MediaField } from '../components/MediaField';
import { useToast } from '../components/Toast';

interface Mat { id: string; class_id: string; class_name: string; week_label: string | null; title: string; summary: string | null; video_url: string | null; homework: string | null; due_at: string | null; media_id: string | null; is_published: boolean }

function Editor({ m, classes, onClose, onSaved }: { m: Mat | null; classes: ClassDto[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    classId: m?.class_id ?? classes[0]?.id ?? '', weekLabel: m?.week_label ?? '', title: m?.title ?? '', summary: m?.summary ?? '', videoUrl: m?.video_url ?? '',
    homework: m?.homework ?? '', due: m?.due_at ? isoToTashkentLocal(m.due_at) : '', mediaId: m?.media_id ?? null as string | null, isPublished: m?.is_published ?? false,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { classId: f.classId, weekLabel: f.weekLabel || null, title: f.title, summary: f.summary || null, videoUrl: f.videoUrl || null, homework: f.homework || null, dueAt: f.due ? tashkentLocalToIso(f.due) : null, mediaId: f.mediaId, isPublished: f.isPublished };
      await api(m ? `/api/admin/materials/${m.id}` : '/api/admin/materials', { method: m ? 'PUT' : 'POST', body });
      toast('Saqlandi');
      onSaved();
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  return (
    <Modal title={m ? 'Materialni tahrirlash' : 'Yangi material'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Sinf<select className="input mt-1" value={f.classId} onChange={(e) => set('classId', e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Sarlavha<input className="input mt-1" maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="block text-sm font-medium">Hafta<input className="input mt-1" maxLength={40} value={f.weekLabel} onChange={(e) => set('weekLabel', e.target.value)} /></label>
        <label className="block text-sm font-medium">Qisqacha konspekt<textarea className="input mt-1 min-h-24" maxLength={5000} value={f.summary} onChange={(e) => set('summary', e.target.value)} /></label>
        <label className="block text-sm font-medium">Video havolasi (https://…)<input className="input mt-1" value={f.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} /></label>
        <label className="block text-sm font-medium">Uy vazifasi<textarea className="input mt-1" maxLength={3000} value={f.homework} onChange={(e) => set('homework', e.target.value)} /></label>
        <label className="block text-sm font-medium">Topshirish muddati<input className="input mt-1" type="datetime-local" value={f.due} onChange={(e) => set('due', e.target.value)} /></label>
        <MediaField label="Rasm (ixtiyoriy)" kind="image" value={f.mediaId} onChange={(v) => set('mediaId', v)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isPublished} onChange={(e) => set('isPublished', e.target.checked)} /> O'quvchilarga ko'rinsin (nashr qilish)</label>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Bekor qilish</button><button className="btn" disabled={busy || !f.title.trim() || !f.classId} onClick={() => void save()}>Saqlash</button></div>
      </div>
    </Modal>
  );
}

export function MaterialsPage() {
  const toast = useToast();
  const classes = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  const d = useAsync(() => api<{ items: Mat[] }>('/api/admin/materials'), []);
  const [edit, setEdit] = useState<{ m: Mat | null } | null>(null);
  const del = async (m: Mat) => {
    if (!window.confirm(`«${m.title}» o'chirilsinmi?`)) return;
    try { await api(`/api/admin/materials/${m.id}`, { method: 'DELETE' }); toast('O\'chirildi'); d.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Haftalik materiallar</h1><button className="btn" onClick={() => setEdit({ m: null })}>+ Material</button></div>
      {d.loading ? <Spinner /> : d.error || !d.data ? <p role="alert" className="text-danger">{errMsg(d.error)}</p> : d.data.items.length === 0 ? <Empty>Materiallar yo'q.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">Sarlavha</th><th className="th">Sinf</th><th className="th">Hafta</th><th className="th">Muddat</th><th className="th">Holat</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {d.data.items.map((m) => (
                <tr key={m.id}>
                  <td className="td font-medium">{m.title}</td><td className="td">{m.class_name}</td><td className="td">{m.week_label ?? ''}</td>
                  <td className="td">{m.due_at ? formatTashkent(m.due_at) : ''}</td><td className="td">{m.is_published ? 'Nashr qilingan' : 'Qoralama'}</td>
                  <td className="td space-x-2 text-right"><button className="btn-sm" onClick={() => setEdit({ m })}>Tahrirlash</button><button className="btn-sm" onClick={() => void del(m)}>O'chirish</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && classes.data && <Editor m={edit.m} classes={classes.data.items} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); d.reload(); }} />}
    </div>
  );
}
