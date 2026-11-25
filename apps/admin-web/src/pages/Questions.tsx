import { useState } from 'react';
import { XlsxImport } from '../components/XlsxImport';
import { MediaField } from '../components/MediaField';
import { generateParams, importTemplateCsv, renderTemplate, validateQuestion } from '@pep/shared';
import type { ParamSpec, QuestionInput } from '@pep/shared';
import { ApiFail, api, errMsg } from '../lib/api';
import { Empty, Modal, Spinner, useAsync } from '../components/ui';
import { MathText } from '../components/MathText';
import { useToast } from '../components/Toast';

export interface TopicRow { id: string; name: string; grade: number | null; questionCount: number }
interface Row { id: string; type: string; body: string; topic_id: string | null; difficulty: number; points: string; is_archived: boolean; times_used: number }

const TYPES: [string, string][] = [
  ['text', 'Matnli (bitta javob)'], ['formula', 'Formulali'], ['image', 'Rasmli'], ['graph', 'Grafikli'], ['circuit', 'Elektr zanjiri'],
  ['optics', 'Optika'], ['vectors', 'Vektorlar'], ['table', 'Jadvalli'], ['multi', 'Bir nechta to\'g\'ri javob'], ['numeric', 'Sonli javob'],
];

interface Form {
  type: string; body: string; explanation: string; topicId: string; difficulty: number; points: string;
  options: { body: string; isCorrect: boolean }[];
  numMode: 'fixed' | 'param';
  expected: string; tolAbs: string; tolRel: string;
  params: { name: string; min: string; max: string; step: string }[];
  constraints: string; expr: string; decimals: string;
  imageMediaId: string | null;
}

const emptyForm = (): Form => ({
  type: 'text', body: '', explanation: '', topicId: '', difficulty: 2, points: '1',
  options: [{ body: '', isCorrect: true }, { body: '', isCorrect: false }, { body: '', isCorrect: false }, { body: '', isCorrect: false }],
  numMode: 'fixed', expected: '', tolAbs: '', tolRel: '',
  params: [{ name: 'm', min: '1', max: '10', step: '1' }], constraints: '', expr: '', decimals: '2', imageMediaId: null,
});

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

function toTolerance(abs: string, rel: string) {
  const t: { abs?: number; rel?: number } = {};
  if (abs.trim() !== '') t.abs = num(abs);
  if (rel.trim() !== '') t.rel = num(rel) / 100; // foizda kiritiladi
  return t;
}

export function formToInput(f: Form): QuestionInput {
  const base = {
    type: f.type as QuestionInput['type'], body: f.body, explanation: f.explanation.trim() || null, topicId: f.topicId || null,
    difficulty: f.difficulty, points: num(f.points), tags: [] as string[], imageMediaId: f.imageMediaId,
  };
  if (f.type !== 'numeric') return { ...base, options: f.options.filter((o) => o.body.trim() !== '') } as QuestionInput;
  if (f.numMode === 'fixed') {
    return { ...base, options: [], answerSpec: { expected: num(f.expected), tolerance: toTolerance(f.tolAbs, f.tolRel) } } as QuestionInput;
  }
  const spec: ParamSpec = {
    params: f.params.map((p) => ({ name: p.name.trim(), min: num(p.min), max: num(p.max), step: num(p.step) })),
    constraints: f.constraints.split('\n').map((x) => x.trim()).filter(Boolean),
    answer: { expr: f.expr.trim(), decimals: Math.round(num(f.decimals)), tolerance: toTolerance(f.tolAbs, f.tolRel) },
  };
  return { ...base, options: [], paramSpec: spec } as QuestionInput;
}

function Editor({ id, topics, onClose, onSaved }: { id: string | null; topics: TopicRow[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>(emptyForm);
  const [loading, setLoading] = useState(id !== null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<{ body: string; answer: number } | null>(null);

  useAsync(async () => {
    if (!id) return null;
    const r = await api<{ question: Record<string, unknown>; options: { body: string; is_correct: boolean }[] }>(`/api/admin/questions/${id}`);
    const q = r.question as {
      type: string; body: string; explanation: string | null; topic_id: string | null; difficulty: number; points: string; image_media_id: string | null;
      param_spec: ParamSpec | null; answer_spec: { expected: number; tolerance: { abs?: number; rel?: number } } | null;
    };
    const tol = q.param_spec?.answer.tolerance ?? q.answer_spec?.tolerance ?? {};
    setF({
      ...emptyForm(), type: q.type, body: q.body, explanation: q.explanation ?? '', topicId: q.topic_id ?? '', difficulty: q.difficulty, points: String(Number(q.points)),
      options: r.options.length ? r.options.map((o) => ({ body: o.body, isCorrect: o.is_correct })) : emptyForm().options,
      numMode: q.param_spec ? 'param' : 'fixed', expected: q.answer_spec ? String(q.answer_spec.expected) : '',
      tolAbs: tol.abs !== undefined ? String(tol.abs) : '', tolRel: tol.rel !== undefined ? String(tol.rel * 100) : '',
      params: q.param_spec ? q.param_spec.params.map((p) => ({ name: p.name, min: String(p.min), max: String(p.max), step: String(p.step) })) : emptyForm().params,
      constraints: (q.param_spec?.constraints ?? []).join('\n'), expr: q.param_spec?.answer.expr ?? '', decimals: String(q.param_spec?.answer.decimals ?? 2), imageMediaId: q.image_media_id,
    });
    setLoading(false);
    return null;
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((c) => ({ ...c, [k]: v }));
  const setOpt = (i: number, patch: Partial<Form['options'][number]>) =>
    setF((c) => ({ ...c, options: c.options.map((o, j) => (j === i ? { ...o, ...patch } : patch.isCorrect && c.type !== 'multi' ? { ...o, isCorrect: false } : o)) }));
  const multi = f.type === 'multi';

  const save = async () => {
    const input = formToInput(f);
    const errs = validateQuestion(input);
    if (errs.length) return setProblems(errs);
    setProblems([]);
    setBusy(true);
    try {
      if (id) await api(`/api/admin/questions/${id}`, { method: 'PUT', body: input });
      else await api('/api/admin/questions', { method: 'POST', body: input });
      toast('Saqlandi');
      onSaved();
    } catch (e) {
      const d = e instanceof ApiFail && Array.isArray(e.details) ? (e.details as unknown[]).map(String) : [];
      setProblems(d.length ? d : [errMsg(e)]);
    } finally { setBusy(false); }
  };

  const makeSample = () => {
    try {
      const input = formToInput(f);
      if (!input.paramSpec) return;
      const g = generateParams(input.paramSpec as ParamSpec, (n) => Math.floor(Math.random() * n));
      setSample({ body: renderTemplate(f.body, g.values), answer: g.answer });
      setProblems([]);
    } catch (e) { setProblems([e instanceof Error ? e.message : 'Namuna yaratilmadi']); setSample(null); }
  };

  return (
    <Modal title={id ? 'Savolni tahrirlash' : 'Yangi savol'} onClose={onClose}>
      {loading ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Turi
              <select className="input mt-1" value={f.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Mavzu
              <select className="input mt-1" value={f.topicId} onChange={(e) => set('topicId', e.target.value)}>
                <option value="">— mavzusiz —</option>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.grade ? `${t.grade}-sinf: ` : ''}{t.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Qiyinlik (1–5)
              <input type="number" min={1} max={5} className="input mt-1" value={f.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))} />
            </label>
            <label className="block text-sm font-medium">Ball
              <input className="input mt-1" inputMode="decimal" value={f.points} onChange={(e) => set('points', e.target.value)} />
            </label>
          </div>

          <label className="block text-sm font-medium">Savol matni
            <textarea className="input mt-1 min-h-[96px]" value={f.body} onChange={(e) => set('body', e.target.value)}
              placeholder={'Formula: $F = ma$. Parametr: {{m}}'} />
          </label>
          <MediaField label="Savol rasmi (ixtiyoriy)" kind="image" value={f.imageMediaId} onChange={(v) => set('imageMediaId', v)} />
          {f.body.trim() && <div className="rounded-lg border border-line p-3 text-sm"><span className="mb-1 block text-xs text-mute">Ko'rinishi</span><MathText text={f.body} /></div>}

          {f.type !== 'numeric' ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Variantlar ({multi ? 'bir nechta to\'g\'ri belgilash mumkin' : 'bitta to\'g\'ri javobni belgilang'})</legend>
              {f.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type={multi ? 'checkbox' : 'radio'} name="correct" checked={o.isCorrect} onChange={(e) => setOpt(i, { isCorrect: e.target.checked })} aria-label={`${i + 1}-variant to'g'ri`} />
                  <input className="input" value={o.body} onChange={(e) => setOpt(i, { body: e.target.value })} placeholder={`Variant ${i + 1}`} />
                  <button className="btn-sm" type="button" aria-label="Variantni o'chirish" disabled={f.options.length <= 2}
                    onClick={() => set('options', f.options.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {f.options.length < 8 && <button className="btn-sm" type="button" onClick={() => set('options', [...f.options, { body: '', isCorrect: false }])}>+ Variant</button>}
            </fieldset>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <label><input type="radio" checked={f.numMode === 'fixed'} onChange={() => set('numMode', 'fixed')} /> Aniq javob</label>
                <label><input type="radio" checked={f.numMode === 'param'} onChange={() => set('numMode', 'param')} /> Parametrli (har o'quvchiga boshqa sonlar)</label>
              </div>
              {f.numMode === 'fixed' ? (
                <label className="block text-sm font-medium">To'g'ri javob (son)
                  <input className="input mt-1" inputMode="decimal" value={f.expected} onChange={(e) => set('expected', e.target.value)} />
                </label>
              ) : (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <p className="text-xs text-mute">Matnda <code>{'{{m}}'}</code> ko'rinishida yozing. Javob formulasi: <code>m*a</code>, <code>sqrt(2*g*h)</code> (g = 9.81, pi, sin, cos, ln, …).</p>
                  {f.params.map((p, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2">
                      {(['name', 'min', 'max', 'step'] as const).map((k) => (
                        <input key={k} className="input" aria-label={k} placeholder={k} value={p[k]}
                          onChange={(e) => set('params', f.params.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                      ))}
                      <button className="btn-sm" type="button" disabled={f.params.length <= 1} onClick={() => set('params', f.params.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  <button className="btn-sm" type="button" onClick={() => set('params', [...f.params, { name: '', min: '1', max: '10', step: '1' }])}>+ Parametr</button>
                  <label className="block text-sm font-medium">Shartlar (har qatorda bittadan, masalan <code>m*a {'<='} 50</code>)
                    <textarea className="input mt-1" value={f.constraints} onChange={(e) => set('constraints', e.target.value)} />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="col-span-2 block text-sm font-medium">Javob formulasi
                      <input className="input mt-1" value={f.expr} onChange={(e) => set('expr', e.target.value)} placeholder="m*a" />
                    </label>
                    <label className="block text-sm font-medium">Kasr xonalari
                      <input className="input mt-1" inputMode="numeric" value={f.decimals} onChange={(e) => set('decimals', e.target.value)} />
                    </label>
                  </div>
                  <button className="btn-sm" type="button" onClick={makeSample}>Namuna yaratish</button>
                  {sample && <div className="rounded-lg bg-bg p-2 text-sm"><MathText text={sample.body} /><div className="mt-1 text-mute">To'g'ri javob: <b>{sample.answer}</b></div></div>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Ruxsat etilgan xato (mutlaq)
                  <input className="input mt-1" inputMode="decimal" value={f.tolAbs} onChange={(e) => set('tolAbs', e.target.value)} placeholder="masalan 0.1" />
                </label>
                <label className="block text-sm font-medium">yoki nisbiy, %
                  <input className="input mt-1" inputMode="decimal" value={f.tolRel} onChange={(e) => set('tolRel', e.target.value)} placeholder="masalan 1" />
                </label>
              </div>
              <p className="text-xs text-mute">Kamida bittasini kiriting; ikkalasi bo'lsa kattasi olinadi.</p>
            </div>
          )}

          <label className="block text-sm font-medium">Izoh / yechim (ixtiyoriy, natijadan keyin ko'rsatilishi mumkin)
            <textarea className="input mt-1" value={f.explanation} onChange={(e) => set('explanation', e.target.value)} />
          </label>

          {problems.length > 0 && <ul role="alert" className="list-disc rounded-lg border border-danger p-3 pl-6 text-sm text-danger">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>Bekor qilish</button>
            <button className="btn" disabled={busy} onClick={() => void save()}>Saqlash</button>
          </div>
        </div>
      )}
    </Modal>
  );
}


interface ImportPreview { committed: boolean; total: number; valid: number; errors: { row: number; message: string }[]; sample: { row: number; type: string; body: string; topic: string | null }[]; newTopics: string[] }

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [prev, setPrev] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (commit: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<ImportPreview>('/api/admin/questions/import', { method: 'POST', body: { csv, commit } });
      setPrev(r);
      if (r.committed) {
        toast(`${r.valid} ta savol import qilindi`);
        onDone();
      }
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 180_000) return setErr('Fayl juda katta (180 KB gacha, ~300 savol). Qismlarga bo\'ling.');
    setCsv(await f.text());
    setPrev(null);
    setErr(null);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + importTemplateCsv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'savollar-shablon.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title="CSV dan import" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-mute">
          Excel'da tayyorlang: "Boshqacha saqlash → CSV UTF-8". Avval shablonni yuklab oling. Bitta xato bo'lsa, hech narsa import qilinmaydi.
          Parametrli savollar CSV orqali emas, forma orqali kiritiladi.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-sm" type="button" onClick={download}>Shablonni yuklab olish</button>
          <input type="file" accept=".csv,text/csv" aria-label="CSV fayl" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <textarea className="input min-h-[120px] font-mono text-xs" aria-label="CSV matni" value={csv} placeholder="yoki CSV matnini shu yerga qo'ying"
          onChange={(e) => { setCsv(e.target.value); setPrev(null); }} />
        {err && <p role="alert" className="text-danger">{err}</p>}
        {prev && (
          <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
            <p>Jami qatorlar: <b>{prev.total}</b> · yaroqli: <b>{prev.valid}</b> · xato: <b className={prev.errors.length ? 'text-danger' : ''}>{prev.errors.length}</b></p>
            {prev.newTopics.length > 0 && <p>Yangi mavzular yaratiladi: {prev.newTopics.join(', ')}</p>}
            {prev.errors.length > 0 && (
              <ul className="max-h-40 list-disc overflow-auto pl-5 text-danger">
                {prev.errors.slice(0, 50).map((e, i) => <li key={i}>{e.row}-qator: {e.message}</li>)}
              </ul>
            )}
            {prev.errors.length === 0 && prev.sample.length > 0 && (
              <ul className="list-disc pl-5 text-mute">{prev.sample.map((x) => <li key={x.row}>{x.row}-qator · {x.type} · {x.body}</li>)}</ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Yopish</button>
          <button className="btn-ghost" disabled={!csv.trim() || busy} onClick={() => void run(false)}>Tekshirish</button>
          <button className="btn" disabled={busy || !prev || prev.errors.length > 0 || prev.valid === 0 || prev.committed} onClick={() => void run(true)}>Import qilish</button>
        </div>
      </div>
    </Modal>
  );
}

export function QuestionsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [topicId, setTopicId] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [xlsx, setXlsx] = useState(false);
  const [week, setWeek] = useState('');
  const [tag, setTag] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const topics = useAsync(() => api<{ items: TopicRow[] }>('/api/admin/topics'), []);
  const list = useAsync(() => {
    const q = new URLSearchParams({ limit: '100', includeArchived: String(archived) });
    if (search.trim()) q.set('search', search.trim());
    if (topicId) q.set('topicId', topicId);
    if (week.trim()) q.set('weekLabel', week.trim());
    if (tag.trim()) q.set('tag', tag.trim());
    return api<{ items: Row[] }>(`/api/admin/questions?${q}`);
  }, [search, topicId, archived, week, tag]);

  const newTopic = async () => {
    const name = window.prompt('Yangi mavzu nomi');
    if (!name?.trim()) return;
    const g = window.prompt('Sinf (1–12), bo\'sh qoldirish mumkin');
    try {
      await api('/api/admin/topics', { method: 'POST', body: { name, grade: g?.trim() ? Number(g) : null } });
      toast('Mavzu qo\'shildi');
      topics.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const archive = async (r: Row) => {
    try {
      await api(`/api/admin/questions/${r.id}/archive`, { method: 'POST', body: { archived: !r.is_archived } });
      toast(r.is_archived ? 'Qaytarildi' : 'Arxivlandi');
      list.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const duplicate = async (r: Row) => {
    try { await api(`/api/admin/questions/${r.id}/duplicate`, { method: 'POST' }); toast('Nusxa yaratildi'); list.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const bulk = async (body: Record<string, unknown>, done: string) => {
    try {
      const r = await api<{ updated: number }>('/api/admin/questions/bulk', { method: 'POST', body: { ids: sel, ...body } });
      toast(`${done}: ${r.updated} ta`);
      setSel([]);
      list.reload(); topics.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  const tname = (id: string | null) => topics.data?.items.find((t) => t.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Savollar banki</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => void newTopic()}>+ Mavzu</button>
          <button className="btn-ghost" onClick={() => setImporting(true)}>CSV import</button>
          <button className="btn-ghost" onClick={() => setXlsx(true)}>Excel import</button>
          <button className="btn" onClick={() => setEditing({ id: null })}>+ Savol</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="Qidirish…" aria-label="Qidirish" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-xs" aria-label="Mavzu" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Barcha mavzular</option>
          {topics.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.questionCount})</option>)}
        </select>
        <input className="input max-w-[9rem]" placeholder="Hafta" aria-label="Hafta" value={week} onChange={(e) => setWeek(e.target.value)} />
        <input className="input max-w-[9rem]" placeholder="Teg" aria-label="Teg" value={tag} onChange={(e) => setTag(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Arxivdagilar</label>
      </div>
      {sel.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 text-sm" role="region" aria-label="Ommaviy amallar">
          <b>{sel.length} ta tanlandi:</b>
          <button className="btn-sm" onClick={() => void bulk({ action: 'archive' }, 'Arxivlandi')}>Arxivlash</button>
          <button className="btn-sm" onClick={() => void bulk({ action: 'restore' }, 'Qaytarildi')}>Qaytarish</button>
          <select className="input w-auto" aria-label="Mavzu belgilash" value="" onChange={(e) => { if (e.target.value) void bulk({ action: 'set_topic', topicId: e.target.value === '-' ? null : e.target.value }, 'Mavzu o\'zgardi'); }}>
            <option value="">Mavzu belgilash…</option><option value="-">(mavzusiz)</option>
            {topics.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input w-auto" aria-label="Qiyinlik belgilash" value="" onChange={(e) => { if (e.target.value) void bulk({ action: 'set_difficulty', difficulty: Number(e.target.value) }, 'Qiyinlik o\'zgardi'); }}>
            <option value="">Qiyinlik…</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn-sm" onClick={() => { const w = window.prompt('Hafta nomi (bo\'sh = olib tashlash)'); if (w !== null) void bulk({ action: 'set_week', weekLabel: w.trim() || null }, 'Hafta o\'zgardi'); }}>Hafta</button>
          <button className="btn-sm" onClick={() => { const t = window.prompt('Qo\'shiladigan teg'); if (t?.trim()) void bulk({ action: 'add_tag', tag: t.trim() }, 'Teg qo\'shildi'); }}>+ Teg</button>
          <button className="btn-sm" onClick={() => setSel([])}>Bekor qilish</button>
        </div>
      )}
      {list.loading ? <Spinner /> : list.error || !list.data ? <p role="alert" className="text-danger">{errMsg(list.error)}</p> : list.data.items.length === 0 ? (
        <Empty>Savollar yo'q. "+ Savol" tugmasi bilan birinchisini qo'shing.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th w-8"><input type="checkbox" aria-label="Hammasini tanlash" checked={list.data.items.length > 0 && sel.length === list.data.items.length} onChange={(e) => setSel(e.target.checked ? list.data!.items.map((x) => x.id) : [])} /></th><th className="th">Savol</th><th className="th">Turi</th><th className="th">Mavzu</th><th className="th">Qiyinlik</th><th className="th">Ball</th><th className="th">Ishlatilgan</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((r) => (
                <tr key={r.id} className={r.is_archived ? 'opacity-60' : ''}>
                  <td className="td"><input type="checkbox" aria-label="Tanlash" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
                  <td className="td max-w-md truncate" title={r.body}>{r.body.slice(0, 90)}</td>
                  <td className="td">{TYPES.find(([v]) => v === r.type)?.[1] ?? r.type}</td>
                  <td className="td">{tname(r.topic_id)}</td>
                  <td className="td">{r.difficulty}</td>
                  <td className="td">{Number(r.points)}</td>
                  <td className="td">{r.times_used}</td>
                  <td className="td space-x-2 text-right">
                    <button className="btn-sm" onClick={() => setEditing({ id: r.id })}>Tahrirlash</button>
                    <button className="btn-sm" onClick={() => void duplicate(r)}>Nusxa</button>
                    <button className="btn-sm" onClick={() => void archive(r)}>{r.is_archived ? 'Qaytarish' : 'Arxivlash'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {xlsx && <XlsxImport title="Savollarni Excel'dan import" hint="Birinchi qator sarlavha (CSV shabloni bilan bir xil ustunlar). Avval 'Ko'rib chiqish', xato bo'lmasa 'Import qilish'." url="/api/admin/questions/import-xlsx" onClose={() => setXlsx(false)} onDone={() => { list.reload(); topics.reload(); }} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { list.reload(); topics.reload(); }} />}
      {editing && <Editor id={editing.id} topics={topics.data?.items ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); topics.reload(); }} />}
    </div>
  );
}
