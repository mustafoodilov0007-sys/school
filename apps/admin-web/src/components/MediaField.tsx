import { useState } from 'react';
import { errMsg, uploadMedia } from '../lib/api';

/** Fayl tanlash + yuklash. `value` — media id. Rasm uchun oldindan ko'rish (admin cookie bilan ochiladi). */
export function MediaField({ label, kind, value, onChange }: { label: string; kind: 'image' | 'pdf'; value: string | null; onChange: (id: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const max = kind === 'image' ? 2 : 10;
  return (
    <div className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept={kind === 'image' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'}
          disabled={busy}
          aria-label={label}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > max * 1024 * 1024) { setErr(`Fayl ${max} MB dan oshmasin`); return; }
            setBusy(true); setErr(null);
            try { onChange((await uploadMedia(f, kind)).id); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
          }}
        />
        {busy && <span className="text-mute">Yuklanmoqda…</span>}
        {value && <button type="button" className="btn-sm" onClick={() => onChange(null)}>Olib tashlash</button>}
        {value && kind === 'pdf' && <a className="underline" href={`/api/admin/media/${value}`} target="_blank" rel="noreferrer">PDF'ni ochish</a>}
      </div>
      {value && kind === 'image' && <img src={`/api/admin/media/${value}`} alt="Savol rasmi" className="max-h-48 rounded-lg border border-line" />}
      <p className="text-xs text-mute">{kind === 'image' ? 'PNG, JPEG yoki WEBP' : 'PDF'}, ko'pi bilan {max} MB.</p>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
