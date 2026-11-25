import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [dev, setDev] = useState(false);
  const [tg, setTg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ devLogin: boolean }>('/api/admin/auth/config').then((c) => setDev(c.devLogin), () => undefined);
  }, []);

  return (
    <div className="mx-auto mt-24 max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-bold">Physics Exam Pro — Admin</h1>
      <div className="card space-y-2">
        <p className="font-semibold">Kirish</p>
        <ol className="list-decimal space-y-1 pl-5 text-mute">
          <li>Telegramda botingizga <b>/admin</b> buyrug'ini yuboring.</li>
          <li>Bot bergan bir martalik havolani shu brauzerda oching (5 daqiqa amal qiladi).</li>
        </ol>
      </div>
      {dev && (
        <form className="card space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/api/admin/auth/dev-login', { method: 'POST', body: { telegramId: Number(tg) } });
            await refresh();
            nav('/');
          } catch (x) { setErr(errMsg(x)); }
        }}>
          <p className="text-sm font-semibold text-danger">Faqat lokal ishlab chiqish (ALLOW_DEV_AUTH)</p>
          <input className="input" inputMode="numeric" placeholder="Admin Telegram ID" value={tg} onChange={(e) => setTg(e.target.value)} />
          <button className="btn w-full" disabled={!/^\d+$/.test(tg)}>DEV kirish</button>
          {err && <p role="alert" className="text-danger">{err}</p>}
        </form>
      )}
    </div>
  );
}

/** /auth/callback#token=... — token fragmentda: serverga va Referer'ga tushmaydi. Darhol manzildan o'chiriladi. */
export function AuthCallback() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode ikki marta ishga tushirmasin (token bir martalik)
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    history.replaceState(null, '', '/auth/callback');
    if (!token) { setErr('Havola noto\'g\'ri. Botda /admin ni qayta yuboring.'); return; }
    api('/api/admin/auth/exchange', { method: 'POST', body: { token } })
      .then(refresh)
      .then(() => nav('/', { replace: true }))
      .catch((e: unknown) => setErr(errMsg(e)));
  }, [nav, refresh]);

  return (
    <div className="mx-auto mt-24 max-w-md p-4 text-center">
      {err ? <p role="alert" className="text-danger">{err}</p> : <p role="status">Kirilmoqda…</p>}
    </div>
  );
}
