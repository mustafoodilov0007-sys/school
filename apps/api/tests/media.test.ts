import { describe, expect, it } from 'vitest';
import { sniffMedia } from '../src/services/media';

describe('sniffMedia: tur baytlardan aniqlanadi', () => {
  it('PNG/JPEG/WEBP/PDF taniladi', () => {
    expect(sniffMedia(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe('image/png');
    expect(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(sniffMedia(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))?.mime).toBe('image/webp');
    expect(sniffMedia(Buffer.from('%PDF-1.7\n'))?.kind).toBe('pdf');
  });
  it('SVG, HTML va bo\'sh/qisqa fayl rad etiladi', () => {
    expect(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'))).toBeNull();
    expect(sniffMedia(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffMedia(Buffer.alloc(0))).toBeNull();
    expect(sniffMedia(Buffer.from('GIF89a'))).toBeNull();
  });
});
