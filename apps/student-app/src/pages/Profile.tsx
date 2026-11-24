import { formatTashkent, t } from '@pep/shared';
import { useAuth } from '../lib/auth';

export function Profile() {
  const { state } = useAuth();
  if (state.status !== 'ready' || state.role !== 'student') return null;
  const s = state.student;
  const rows: [string, string][] = [
    ['Ism', s.firstName],
    ['Familiya', s.lastName],
    [t('app_class'), s.className],
    [t('app_profile_id'), s.code],
    [t('app_profile_linked'), s.telegramLinkedAt ? formatTashkent(s.telegramLinkedAt) : '—'],
  ];
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{t('app_nav_profile')}</h1>
      <dl className="card divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="text-mute">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-mute">{t('app_profile_unlink_note')}</p>
    </div>
  );
}
