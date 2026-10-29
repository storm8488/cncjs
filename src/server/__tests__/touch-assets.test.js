/* eslint-env jest */
import fs from 'fs';
import path from 'path';
import settings from '../config/settings';

// The touch interface is mounted from settings.assets.touch (settings.base.js).
// Its path is written for the compiled server (output/ or dist/cncjs/server/
// config, four levels under the checkout), so from src/ it only has the right
// tail; the directory itself is checked at its repository location. The
// packaged install is checked separately by scripts/test-installed-package.sh.
describe('touch assets mount', () => {
  const asset = settings.assets.touch;
  const checkout = path.resolve(__dirname, '..', '..', '..');
  const touchDirectory = path.join(checkout, 'examples', 'cncjs-touch', 'touch');

  it('is configured on the touch/ route with the examples directory', () => {
    expect(asset).toBeDefined();
    expect(asset.routes).toEqual(['touch/']);
    expect(path.isAbsolute(asset.path)).toBe(true);
    expect(asset.path.split(path.sep).slice(-3)).toEqual(['examples', 'cncjs-touch', 'touch']);
    expect(path.relative(checkout, path.resolve(checkout, 'dist', 'cncjs', 'server', 'config', '..', '..', '..', '..', 'examples', 'cncjs-touch', 'touch'))).toBe(path.relative(checkout, touchDirectory));
  });

  it('serves a directory holding the shell page and its scripts', () => {
    expect(fs.existsSync(path.join(touchDirectory, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(touchDirectory, 'simulation.html'))).toBe(true);
    expect(fs.existsSync(path.join(touchDirectory, 'touch-shell.js'))).toBe(true);
    expect(fs.existsSync(path.join(touchDirectory, 'app.js'))).toBe(true);
    const html = fs.readFileSync(path.join(touchDirectory, 'index.html'), 'utf8');
    expect(html).toContain('touch-shell.js');
  });
});
