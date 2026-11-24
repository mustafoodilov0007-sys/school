export type MathPart = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

/**
 * Matnni oddiy qism va KaTeX qismlarga bo'ladi: `$...$` (qator ichida), `$$...$$` (alohida qator).
 * `\$` — oddiy dollar belgisi. Yopilmagan `$` oddiy matn sifatida qoladi. HTML hech qachon yaratilmaydi.
 */
export function splitMath(input: string): MathPart[] {
  const parts: MathPart[] = [];
  let text = '';
  const flush = () => {
    if (text) parts.push({ kind: 'text', value: text });
    text = '';
  };
  let i = 0;
  while (i < input.length) {
    const ch = input[i] as string;
    if (ch === '\\' && input[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }
    if (ch === '$') {
      const display = input[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = display ? '$$' : '$';
      let j = i + open;
      let found = -1;
      while (j < input.length) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input.startsWith(close, j)) {
          found = j;
          break;
        }
        j++;
      }
      const body = found >= 0 ? input.slice(i + open, found) : '';
      if (found >= 0 && body.trim().length > 0) {
        flush();
        parts.push({ kind: 'math', value: body, display });
        i = found + close.length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return parts;
}
