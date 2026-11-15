// The standalone page has no Babel/build step and must run on Chromium 106.
// Keep its checks independent of the React/Babel application style configuration.
module.exports = {
  root: true,
  extends: 'eslint:recommended',
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022 },
  rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  overrides: [{
    files: ['touch/*.js'],
    env: { browser: true, es2022: false, es2017: true },
    parserOptions: { ecmaVersion: 2017, sourceType: 'script' }
  }]
};
