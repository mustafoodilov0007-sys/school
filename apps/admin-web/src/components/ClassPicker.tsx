import type { ClassDto } from '@pep/shared';
import { api } from '../lib/api';
import { useAsync } from './ui';
import { useEffect } from 'react';

/** Sinf tanlash: birinchi sinfni avtomatik tanlaydi. */
export function ClassPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const d = useAsync(() => api<{ items: ClassDto[] }>('/api/admin/classes'), []);
  useEffect(() => { if (!value && d.data?.items[0]) onChange(d.data.items[0].id); }, [d.data, value, onChange]);
  return (
    <select className="input w-auto" aria-label="Sinf" value={value} onChange={(e) => onChange(e.target.value)}>
      {(d.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
