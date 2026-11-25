import { evaluate, ExprError, RESERVED_NAMES } from './expr';
import type { RandomInt } from './random';
import type { Tolerance } from './scoring';

export interface ParamDef {
  name: string;
  min: number;
  max: number;
  step: number;
}

export interface ParamSpec {
  params: ParamDef[];
  /** Har biri nolga teng bo'lmagan (rost) natija berishi kerak, masalan "m*a <= 50", "a < g" */
  constraints?: string[];
  answer: { expr: string; decimals: number; tolerance: Tolerance };
}

export class ParamError extends Error {}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,19}$/;
const decimalsOf = (n: number) => {
  const s = String(n);
  return s.includes('.') ? Math.min(s.split('.')[1]?.length ?? 0, 6) : 0;
};
const stepsOf = (p: ParamDef) => Math.floor((p.max - p.min) / p.step + 1e-9);

/** Savolni saqlashdan oldin (va imtihonni ishga tushirishdan oldin) chaqiriladi. Bo'sh massiv — xato yo'q. */
export function validateParamSpec(spec: ParamSpec): string[] {
  const errs: string[] = [];
  if (spec.params.length === 0) errs.push('Kamida bitta parametr kerak');
  const names = new Set<string>();
  for (const p of spec.params) {
    if (!NAME_RE.test(p.name)) errs.push(`Parametr nomi yaroqsiz: "${p.name}"`);
    else if (RESERVED_NAMES.has(p.name)) errs.push(`"${p.name}" band nom (funksiya yoki konstanta)`);
    if (names.has(p.name)) errs.push(`Parametr takrorlangan: ${p.name}`);
    names.add(p.name);
    if (![p.min, p.max, p.step].every(Number.isFinite)) errs.push(`${p.name}: son bo'lishi kerak`);
    else {
      if (!(p.min < p.max)) errs.push(`${p.name}: min < max bo'lishi kerak`);
      if (!(p.step > 0)) errs.push(`${p.name}: step musbat bo'lishi kerak`);
      else if (stepsOf(p) > 1_000_000) errs.push(`${p.name}: qadamlar soni juda ko'p`);
    }
  }
  if (!Number.isInteger(spec.answer.decimals) || spec.answer.decimals < 0 || spec.answer.decimals > 8) errs.push('Javob aniqligi 0..8 xona bo\'lsin');
  if ((spec.answer.tolerance.abs ?? 0) < 0 || (spec.answer.tolerance.rel ?? 0) < 0) errs.push('Tolerantlik manfiy bo\'lmasin');
  if (errs.length) return errs;

  // Sinov: har bir parametrning o'rtacha qiymatida ifodalar hisoblanishi kerak
  const mid = Object.fromEntries(spec.params.map((p) => [p.name, (p.min + p.max) / 2]));
  for (const [label, expr] of [['Javob ifodasi', spec.answer.expr], ...(spec.constraints ?? []).map((c) => ['Shart', c] as const)]) {
    try {
      evaluate(expr, mid);
    } catch (e) {
      errs.push(`${label} "${expr}": ${e instanceof ExprError ? e.message : 'xato'}`);
    }
  }
  return errs;
}

export interface GeneratedParams {
  values: Record<string, number>;
  answer: number;
}

/** Diapazondan (qadam bo'yicha) tasodifiy qiymatlar tanlaydi; shartlar bajarilmaguncha qayta uriniladi. Hisoblash serverda. */
export function generateParams(spec: ParamSpec, randomInt: RandomInt, maxTries = 200): GeneratedParams {
  const problems = validateParamSpec(spec);
  if (problems.length) throw new ParamError(problems.join('; '));
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const values: Record<string, number> = {};
    for (const p of spec.params) {
      const k = randomInt(stepsOf(p) + 1);
      values[p.name] = Number((p.min + k * p.step).toFixed(Math.max(decimalsOf(p.step), decimalsOf(p.min))));
    }
    if (!(spec.constraints ?? []).every((c) => evaluate(c, values) !== 0)) continue;
    const raw = evaluate(spec.answer.expr, values);
    return { values, answer: Number(raw.toFixed(spec.answer.decimals)) };
  }
  throw new ParamError('Shartlarni qanoatlantiradigan qiymat topilmadi — diapazon yoki shartlarni tekshiring');
}

const fmt = (n: number) => String(Number(n.toFixed(6)));

/** `{{m}}` ni qiymat bilan almashtiradi (KaTeX dagi oddiy `{...}` bilan to'qnashmaslik uchun qo'sh qavs). Noma'lum nomlar o'zgarmaydi. */
export function renderTemplate(text: string, values: Readonly<Record<string, number>>): string {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? fmt(values[name] as number) : whole,
  );
}

/** Savol matnidagi `{{nom}}` lar spetsifikatsiyada e'lon qilinganmi? */
export function findUnknownPlaceholders(text: string, spec: ParamSpec): string[] {
  const known = new Set(spec.params.map((p) => p.name));
  return [...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1] as string).filter((n) => !known.has(n));
}
