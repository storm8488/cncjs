/* eslint-env jest */
import fs from 'fs';
import os from 'os';
import path from 'path';
import settings from '../config/settings';
import { findTouchAssets } from '../config/settings.base';

// The touch interface is mounted from settings.assets.touch (settings.base.js).
// Its directory is resolved by findTouchAssets: the copy shipped next to the
// compiled server first (dist/cncjs/touch, output/cncjs/touch, written by
// scripts/copy-touch-assets.sh), then the examples directory of the checkout.
// The packaged install itself is checked by scripts/test-installed-package.sh.
describe('touch assets mount', () => {
  const checkout = path.resolve(__dirname, '..', '..', '..');
  const examplesDirectory = path.join(checkout, 'examples', 'cncjs-touch', 'touch');

  describe('findTouchAssets', () => {
    let root;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'cncjs-touch-assets-'));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    const layout = (...segments) => {
      const directory = path.join(root, ...segments);
      fs.mkdirSync(directory, { recursive: true });
      return directory;
    };

    it('prefers the copy shipped next to the compiled server (dist/cncjs/touch)', () => {
      const config = layout('dist', 'cncjs', 'server', 'config');
      const shipped = layout('dist', 'cncjs', 'touch');
      fs.writeFileSync(path.join(shipped, 'index.html'), '<div class="touch-shell"></div>');
      // The examples directory exists too: the shipped copy still wins.
      const examples = layout('examples', 'cncjs-touch', 'touch');
      fs.writeFileSync(path.join(examples, 'index.html'), '');
      expect(findTouchAssets(config)).toBe(shipped);
    });

    it('falls back to the examples directory for a compiled server inside the checkout', () => {
      const config = layout('output', 'cncjs', 'server', 'config');
      const examples = layout('examples', 'cncjs-touch', 'touch');
      fs.writeFileSync(path.join(examples, 'index.html'), '');
      expect(findTouchAssets(config)).toBe(examples);
    });

    it('falls back to the examples directory for the source tree (src/server/config)', () => {
      const config = layout('src', 'server', 'config');
      const examples = layout('examples', 'cncjs-touch', 'touch');
      fs.writeFileSync(path.join(examples, 'index.html'), '');
      expect(findTouchAssets(config)).toBe(examples);
    });

    it('ignores a shipped directory without index.html', () => {
      const config = layout('dist', 'cncjs', 'server', 'config');
      layout('dist', 'cncjs', 'touch');
      const examples = layout('examples', 'cncjs-touch', 'touch');
      fs.writeFileSync(path.join(examples, 'index.html'), '');
      expect(findTouchAssets(config)).toBe(examples);
    });

    it('returns the shipped location when nothing exists, so app.js skips the asset', () => {
      const config = layout('dist', 'cncjs', 'server', 'config');
      const resolved = findTouchAssets(config);
      expect(resolved).toBe(path.join(root, 'dist', 'cncjs', 'touch'));
      expect(fs.existsSync(resolved)).toBe(false);
    });

    it('accepts an injected existence check', () => {
      const config = path.join(root, 'dist', 'cncjs', 'server', 'config');
      const seen = [];
      const exists = (file) => {
        seen.push(file);
        return false;
      };
      findTouchAssets(config, exists);
      expect(seen).toEqual([
        path.join(root, 'dist', 'cncjs', 'touch', 'index.html'),
        path.join(root, 'examples', 'cncjs-touch', 'touch', 'index.html'),
        path.join(root, 'dist', 'examples', 'cncjs-touch', 'touch', 'index.html')
      ]);
    });
  });

  describe('settings.assets.touch (source tree under Jest)', () => {
    const asset = settings.assets.touch;

    it('is configured on the touch/ route with the examples directory', () => {
      expect(asset).toBeDefined();
      expect(asset.routes).toEqual(['touch/']);
      expect(asset.maxAge).toBe(0);
      expect(path.isAbsolute(asset.path)).toBe(true);
      expect(asset.path).toBe(examplesDirectory);
    });

    it('serves a directory holding the shell page and its scripts', () => {
      expect(fs.existsSync(path.join(asset.path, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(asset.path, 'simulation.html'))).toBe(true);
      expect(fs.existsSync(path.join(asset.path, 'touch-shell.js'))).toBe(true);
      expect(fs.existsSync(path.join(asset.path, 'app.js'))).toBe(true);
      const html = fs.readFileSync(path.join(asset.path, 'index.html'), 'utf8');
      expect(html).toContain('touch-shell.js');
    });
  });

  describe('build scripts', () => {
    const read = (file) => fs.readFileSync(path.join(checkout, 'scripts', file), 'utf8');

    it('copy the touch assets next to the compiled server', () => {
      expect(read('build-prod.sh')).toContain('copy-touch-assets.sh dist/cncjs');
      expect(read('build-latest.sh')).toContain('copy-touch-assets.sh dist/cncjs');
      expect(read('build-dev.sh')).toContain('copy-touch-assets.sh output/cncjs');
      expect(read('copy-touch-assets.sh')).toContain('VERSION.json');
    });

    it('ship dist/ in the npm package', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(checkout, 'package.json'), 'utf8'));
      expect(pkg.files).toContain('dist');
      expect(pkg.main).toBe('./dist/cncjs/server-cli.js');
    });
  });
});
