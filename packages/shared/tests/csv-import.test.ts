import { describe, it, expect } from 'vitest';
import { importTemplateCsv, parseCsv, rowsToQuestions } from '../src';

describe('CSV tahlili', () => {
  it('qo\'shtirnoq, "" escape, qator ichidagi yangi qator, BOM, CRLF', () => {
    const t = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"ko\'p\nqatorli",2\r\n');
    expect(t).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['ko\'p\nqatorli', '2']]);
  });
  it('nuqtali vergul (Excel uzbek/rus lokali) va tab ajratgichi avtomatik', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('bo\'sh qatorlar tashlanadi', () => {
    expect(parseCsv('a,b\n\n,\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('savollarga aylantirish', () => {
  it('namuna shablon xatosiz o\'qiladi (single, multi, numeric)', () => {
    const r = rowsToQuestions(parseCsv(importTemplateCsv));
    expect(r.errors).toEqual([]);
    expect(r.items).toHaveLength(3);
    const [a, b, c] = r.items;
    expect(a!.input.options.filter((o) => o.isCorrect).map((o) => o.body)).toEqual(['50 m']);
    expect(b!.input.options.filter((o) => o.isCorrect)).toHaveLength(2);
    expect(c!.input.answerSpec).toEqual({ expected: 6, tolerance: { abs: 0.1 } });
    expect(a!.topicName).toBe('Kinematika');
    expect(a!.grade).toBe(9);
  });
  it('xatolar qator raqami bilan; yaroqli qatorlar o\'tib ketadi', () => {
    const csv = [
      'type,body,correct,option1,option2,answer',
      'text,"Yaxshi",1,a,b,',
      'text,"To\'g\'ri javobsiz",,a,b,',
      'text,"Raqam chegaradan tashqari",5,a,b,',
      'numeric,"Javobsiz",,,,',
      'sehr,"Noma\'lum tur",1,a,b,',
      'text,"Bitta variant",1,a,,',
    ].join('\n');
    const r = rowsToQuestions(parseCsv(csv));
    expect(r.items.map((i) => i.row)).toEqual([2]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
  });
  it('sarlavhasiz fayl va juda ko\'p qator rad etiladi', () => {
    expect(rowsToQuestions(parseCsv('a,b\n1,2')).errors[0]?.message).toContain('body');
    const many = ['body,correct,option1,option2', ...Array.from({ length: 301 }, () => 'q,1,a,b')].join('\n');
    expect(rowsToQuestions(parseCsv(many)).errors).toHaveLength(1);
  });
  it('parametrli savol CSV orqali kiritilmaydi (formada)', () => {
    // {{m}} matnda bo'lsa paramSpec yo'q -> xato
    const r = rowsToQuestions(parseCsv('type,body,correct,option1,option2\ntext,"Massa {{m}}",1,a,b'));
    expect(r.errors).toHaveLength(1);
  });
});
