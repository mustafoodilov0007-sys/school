import type { AuditLogDto } from '@pep/shared';
import { formatTashkent } from '@pep/shared';
import { api, errMsg } from '../lib/api';
import { Empty, Spinner, useAsync } from '../components/ui';

export function AuditPage() {
  const { data, error, loading } = useAsync(() => api<{ items: AuditLogDto[] }>('/api/admin/audit?limit=100'), []);
  if (loading) return <Spinner />;
  if (error || !data) return <p role="alert" className="text-danger">{errMsg(error)}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Harakatlar tarixi</h1>
      {data.items.length === 0 ? <Empty>Hali yozuvlar yo'q</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><th className="th">Vaqt (Toshkent)</th><th className="th">Kim</th><th className="th">Amal</th><th className="th">Obyekt</th><th className="th">Sabab</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{formatTashkent(a.createdAt)}</td>
                  <td className="td">{a.actorType}{a.actorTelegramId ? ` · ${a.actorTelegramId}` : ''}</td>
                  <td className="td font-mono">{a.action}</td>
                  <td className="td">{a.entityType}</td>
                  <td className="td">{a.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
