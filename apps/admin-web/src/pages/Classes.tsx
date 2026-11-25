import { useState } from 'react';
import type { ClassDto } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, Modal, Spinner, useAsync } from '../components/ui';
import { useToast } from '../components/Toast';

export function ClassesPage() {
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, loading, reload } = useAsync(
    () => api<{ items: ClassDto[] }>(`/api/admin/classes?includeArchived=${showArchived}`),
    [showArchived],
  );
  const [modal, setModal] = useState<{ cls?: ClassDto } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (cls?: ClassDto) => { setName(cls?.name ?? ''); setModal(cls ? { cls } : {}); };
  const save = async () => {
    setBusy(true);
    try {
      if (modal?.cls) await api(`/api/admin/classes/${modal.cls.id}`, { method: 'PATCH', body: { name } });
      else await api('/api/admin/classes', { method: 'POST', body: { name } });
      toast('Saqlandi');
      setModal(null);
      reload();
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const archive = async (c: ClassDto) => {
    try {
      await api(`/api/admin/classes/${c.id}`, { method: 'PATCH', body: { isArchived: !c.isArchived } });
      toast(c.isArchived ? 'Arxivdan chiqarildi' : 'Arxivlandi');
      reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sinflar</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arxivdagilar</label>
          <button className="btn" onClick={() => open()}>+ Sinf qo'shish</button>
        </div>
      </div>
      {loading ? <Spinner /> : error || !data ? <p role="alert" className="text-danger">{errMsg(error)}</p> : data.items.length === 0 ? (
        <Empty>Hali sinf yo'q. "Sinf qo'shish" tugmasini bosing (masalan: 8-A).</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">Sinf</th><th className="th">ID belgisi</th><th className="th">O'quvchilar</th><th className="th">Holat</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td className="td font-medium">{c.name}</td>
                  <td className="td font-mono">{c.codeLabel}</td>
                  <td className="td">{c.studentCount}</td>
                  <td className="td">{c.isArchived ? 'Arxivda' : 'Faol'}</td>
                  <td className="td space-x-2 text-right">
                    <button className="btn-sm" onClick={() => open(c)}>Tahrirlash</button>
                    <button className="btn-sm" onClick={() => void archive(c)}>{c.isArchived ? 'Qaytarish' : 'Arxivlash'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <Modal title={modal.cls ? 'Sinfni tahrirlash' : 'Yangi sinf'} onClose={() => setModal(null)}>
          <label htmlFor="cn" className="mb-1 block text-sm font-medium">Sinf nomi</label>
          <input id="cn" className="input" value={name} maxLength={40} placeholder="8-A" onChange={(e) => setName(e.target.value)} autoFocus />
          <p className="mt-2 text-sm text-mute">O'quvchi ID lari shu nomdan olinadi: 8-A → PH-8A-0417. O'quvchisi bor sinfning ID belgisi o'zgarmaydi.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setModal(null)}>Bekor qilish</button>
            <button className="btn" disabled={!name.trim() || busy} onClick={() => void save()}>Saqlash</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
