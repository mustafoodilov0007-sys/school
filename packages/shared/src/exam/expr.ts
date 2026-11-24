/**
 * Xavfsiz arifmetik ifoda hisoblagich (parametrli savollar uchun).
 * `eval`/`Function` ISHLATILMAYDI: qo'lda yozilgan tokenizer + rekursiv parser, faqat oq ro'yxatdagi
 * funksiya va konstantalar. Uzunlik, token soni va chuqurlik cheklangan. Natija chekli son bo'lishi shart.
 * (Spetsifikatsiya mathjs ni nazarda tutgan; fizika formulalari uchun bu yetarli va hujum yuzasi kichikroq.
 *  Murakkabroq ehtiyoj paydo bo'lsa, mathjs oq ro'yxat bilan keyinroq qo'shiladi.)
 */
export class ExprError extends Error {}

const MAX_LEN = 200;
const MAX_TOKENS = 120;
const MAX_DEPTH = 24;

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, ln: Math.log, log10: Math.log10,
  min: Math.min, max: Math.max, pow: Math.pow,
  round: (x, n = 0) => {
    const f = 10 ** Math.min(Math.max(Math.trunc(n), 0), 12);
    return Math.round(x * f) / f;
  },
  rad: (deg) => (deg * Math.PI) / 180,
  deg: (rad) => (rad * 180) / Math.PI,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, g: 9.81 };

export const RESERVED_NAMES: ReadonlySet<string> = new Set([...Object.keys(FUNCS), ...Object.keys(CONSTS)]);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new ExprError('Ifoda juda uzun');
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|[-+*/^(),<>]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new ExprError(`Ifodada ruxsat etilmagan belgi: "${src.slice(pos).trim().charAt(0)}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3] as string });
    if (out.length > MAX_TOKENS) throw new ExprError('Ifoda juda murakkab');
  }
  return out;
}

class Parser {
  private i = 0;
  private depth = 0;
  private toks: Tok[];
  private vars: ReadonlyMap<string, number>;
  constructor(toks: Tok[], vars: ReadonlyMap<string, number>) {
    this.toks = toks;
    this.vars = vars;
  }

  run(): number {
    const v = this.cmp();
    if (this.i < this.toks.length) throw new ExprError('Ifodada ortiqcha qism bor');
    if (!Number.isFinite(v)) throw new ExprError('Natija chekli son emas (nolga bo\'lish yoki noto\'g\'ri argument?)');
    return v;
  }
  private peek(): Tok | undefined { return this.toks[this.i]; }
  private isOp(v: string) { const t = this.peek(); return t?.t === 'op' && t.v === v; }
  private enter() { if (++this.depth > MAX_DEPTH) throw new ExprError('Ifoda juda chuqur'); }
  private leave() { this.depth--; }

  private cmp(): number {
    let l = this.add();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) {
        this.i++;
        const r = this.add();
        l = (t.v === '<' ? l < r : t.v === '>' ? l > r : t.v === '<=' ? l <= r : t.v === '>=' ? l >= r : t.v === '==' ? l === r : l !== r) ? 1 : 0;
      } else return l;
    }
  }
  private add(): number {
    let l = this.mul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.i++] as Tok).v;
      const r = this.mul();
      l = op === '+' ? l + r : l - r;
    }
    return l;
  }
  private mul(): number {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.toks[this.i++] as Tok).v;
      const r = this.unary();
      l = op === '*' ? l * r : l / r;
    }
    return l;
  }
  private unary(): number {
    this.enter();
    try {
      if (this.isOp('-')) { this.i++; return -this.unary(); }
      if (this.isOp('+')) { this.i++; return this.unary(); }
      return this.pow();
    } finally { this.leave(); }
  }
  private pow(): number {
    const base = this.primary();
    if (this.isOp('^')) {
      this.i++;
      return Math.pow(base, this.unary()); // o'ngdan chapga; 2^-1 ham ishlaydi
    }
    return base;
  }
  private primary(): number {
    const t = this.toks[this.i++];
    if (!t) throw new ExprError('Ifoda to\'liq emas');
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') {
      this.enter();
      const v = this.cmp();
      this.leave();
      if (!this.isOp(')')) throw new ExprError('")" yetishmayapti');
      this.i++;
      return v;
    }
    if (t.t === 'id') {
      if (this.isOp('(')) {
        if (!has(FUNCS, t.v)) throw new ExprError(`Noma'lum funksiya: ${t.v}`);
        this.i++;
        const args: number[] = [];
        if (!this.isOp(')')) {
          for (;;) {
            args.push(this.cmp());
            if (this.isOp(',')) { this.i++; continue; }
            break;
          }
        }
        if (!this.isOp(')')) throw new ExprError('")" yetishmayapti');
        this.i++;
        if (args.length === 0 || args.length > 3) throw new ExprError(`${t.v}: argumentlar soni noto'g'ri`);
        return (FUNCS[t.v] as (...a: number[]) => number)(...args);
      }
      const fromVars = this.vars.get(t.v);
      if (fromVars !== undefined) return fromVars;
      if (has(CONSTS, t.v)) return CONSTS[t.v] as number;
      throw new ExprError(`Noma'lum o'zgaruvchi: ${t.v}`);
    }
    throw new ExprError(`Kutilmagan belgi: ${t.v}`);
  }
}

export function evaluate(expr: string, vars: Readonly<Record<string, number>> = {}): number {
  const map = new Map<string, number>(Object.entries(vars));
  return new Parser(tokenize(expr), map).run();
}
