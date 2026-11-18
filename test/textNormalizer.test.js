const test = require('node:test');
const assert = require('node:assert/strict');
const n = require('../src/textNormalizer');

test('normalizeText limpia espacios, caracteres de control y de ancho cero', () => {
  assert.equal(n.normalizeText('  a\u200B  b\r\n\r\n\r\n\r\nc\u0007 '), 'a b\n\nc');
  assert.equal(n.normalizeText(null), '');
});
test('texto vacío o solo símbolos se rechaza', () => {
  assert.deepEqual(n.prepareForSending('   \n '), { ok: false, code: 'EMPTY_TEXT' });
  assert.equal(n.prepareForSending('?!...').code, 'EMPTY_TEXT');
});
test('texto demasiado largo se rechaza, no se trunca', () => {
  const r = n.prepareForSending('a'.repeat(500), { maxChars: 300 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'TOO_LONG');
});
test('redacta emails, DNI, teléfonos, claves y secretos etiquetados', () => {
  const r = n.prepareForSending('Mail ana@x.es DNI 12345678Z tel 612 345 678 password: hunter2 clave AIzaSyA1234567890abcdefghijklmnopqrstuv');
  assert.ok(r.ok);
  for (const s of ['ana@x.es', '12345678Z', '612 345 678', 'hunter2', 'AIzaSy']) assert.ok(!r.text.includes(s), s);
  assert.ok(r.text.includes('[EMAIL]') && r.text.includes('password: [REDACTADO]'));
  assert.ok(n.countRedactions(r.redactions) >= 5);
});
test('NO destruye datos técnicos legítimos (IP, MAC, máscara, hash)', () => {
  const t = 'IP 192.168.1.10/24 máscara 255.255.255.0 MAC 00:1A:2B:3C:4D:5E md5 d41d8cd98f00b204e9800998ecf8427e puerto 443';
  const r = n.prepareForSending(t);
  assert.equal(r.text, t);
  assert.equal(r.redactions.length, 0);
});
test('clampMaxChars respeta límites', () => {
  assert.equal(n.clampMaxChars(1), 200);
  assert.equal(n.clampMaxChars(10 ** 9), n.ABSOLUTE_MAX_CHARS);
  assert.equal(n.clampMaxChars('x'), n.DEFAULT_MAX_CHARS);
});
