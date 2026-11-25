import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { splitMath } from '@pep/shared';

function Formula({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      // trust:false — KaTeX \href, \includegraphics va boshqa xavfli buyruqlarni o'chiradi; chiqish KaTeX tomonidan escape qilinadi.
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 200 });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (html === null) return <code>{tex}</code>;
  return <span className={display ? 'block overflow-x-auto py-1' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** `$...$` / `$$...$$` ichidagi formulalarni KaTeX bilan ko'rsatadi; qolgan matn React orqali (HTML sifatida talqin qilinmaydi). */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(() => splitMath(text), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'text' ? <span key={i} className="whitespace-pre-wrap">{p.value}</span> : <Formula key={i} tex={p.value} display={p.display} />,
      )}
    </>
  );
}
