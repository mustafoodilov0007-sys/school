import { useEffect, useState } from 'react';
import { fetchMediaUrl } from '../lib/api';

function useMedia(id: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let made: string | null = null;
    setUrl(null); setFailed(false);
    fetchMediaUrl(id).then((u) => { if (alive) { made = u; setUrl(u); } else URL.revokeObjectURL(u); }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return { url, failed };
}

export function QuestionImage({ mediaId }: { mediaId: string | null }) {
  const { url, failed } = useMedia(mediaId);
  if (!mediaId) return null;
  if (failed) return <p className="text-sm text-mute">Rasm yuklanmadi. Internetni tekshiring.</p>;
  if (!url) return <div className="h-32 animate-pulse rounded-lg bg-line" aria-label="Rasm yuklanmoqda" />;
  return <img src={url} alt="Savol rasmi" className="max-h-72 w-full rounded-lg border border-line object-contain" draggable={false} />;
}

/** PDF: Telegram webview'larida iframe ishonchsiz, shuning uchun "Ochish" havolasi ham bor. */
export function ExamPdf({ mediaId }: { mediaId: string | null }) {
  const { url, failed } = useMedia(mediaId);
  const [open, setOpen] = useState(false);
  if (!mediaId) return null;
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Imtihon varag'i (PDF)</h2>
        {url && <a className="text-sm underline" href={url} target="_blank" rel="noreferrer">Ochish</a>}
      </div>
      {failed && <p className="text-sm text-mute">PDF yuklanmadi. Internetni tekshiring.</p>}
      {url && (
        <>
          <button className="btn-sm" type="button" onClick={() => setOpen((v) => !v)}>{open ? 'Yopish' : 'Shu yerda ko\'rsatish'}</button>
          {open && <iframe title="Imtihon PDF" src={url} className="h-[70vh] w-full rounded-lg border border-line" />}
        </>
      )}
    </section>
  );
}
