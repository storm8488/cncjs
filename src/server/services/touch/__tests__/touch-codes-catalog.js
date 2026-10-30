/* eslint-env jest */
// Test helper (not a test file): the Touch client's catalog of coded server
// refusals (examples/cncjs-touch/touch/i18n-messages.js, window.CNCTouchCodes)
// and its formatter (i18n.js, cncI18n.format), loaded in a vm per language, so
// server tests can check that the French template of a stable ETOUCH_* code,
// filled with the emitted params, is exactly the server's French message.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const TOUCH = path.resolve(__dirname, '../../../../../examples/cncjs-touch/touch');

const load = (language) => {
  const window = {};
  const saved = new Map([['cncjs-touch-language-v1', language]]);
  const context = {
    window,
    document: { documentElement: {}, title: '' },
    localStorage: { getItem: (k) => saved.get(k) || null, setItem() {} }
  };
  ['i18n-messages.js', 'i18n.js'].forEach((name) => vm.runInNewContext(fs.readFileSync(path.join(TOUCH, name), 'utf8'), context));
  return window;
};

const cache = {};
const of = (language) => {
  if (!cache[language]) {
    cache[language] = load(language);
  }
  return cache[language];
};

export const catalogCodes = () => of('fr').CNCTouchCodes.map((row) => row[0]);

// Checks one coded refusal or reason ({ code, params, message }): a catalog
// row exists, its French template filled with params is the message itself,
// and the English and Spanish texts are filled (no placeholder left).
export const expectCatalogMatch = ({ code, params, message }) => {
  expect(catalogCodes()).toContain(code);
  expect([code, of('fr').cncI18n.format(code, params, '')]).toEqual([code, message]);
  ['en', 'es'].forEach((language) => {
    const text = of(language).cncI18n.format(code, params, message);
    expect([code, language, /[{}[\]]/.test(text)]).toEqual([code, language, false]);
  });
};
