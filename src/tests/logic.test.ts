import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_CATALOG,
  SpatialOSState,
  clampWindowScale,
  computeWindowArcSlot,
  evaluateHorizontalSwipe,
  getResponsiveBaseScale,
  MAX_WINDOW_SCALE,
  MIN_WINDOW_SCALE,
} from '../os/SpatialOSState';
import {
  BrowserHistory,
  buildWikipediaSummaryEndpoint,
  normalizeBrowserInput,
} from '../apps/browser/BrowserLogic';
import {
  parseDuckDuckGoResults,
  parseHtmlToReadablePage,
  validateSafeExternalUrl,
} from '../apps/browser/BrowserHtmlParser';
import {
  CalculatorLogic,
  evaluateMathExpression,
} from '../apps/calculator/CalculatorLogic';
import {OrbitalShooterLogic} from '../apps/games/OrbitalShooterLogic';
import {MemoryMatrixLogic} from '../apps/games/MemoryMatrixLogic';

test('SpatialOSState pagination, category filter, and open window tracking', () => {
  const os = new SpatialOSState();
  assert.equal(os.getTotalPages(), 2);
  assert.equal(os.getVisibleApps().length, 6);

  assert.equal(os.nextPage(), true);
  assert.equal(os.page, 1);
  assert.equal(os.getVisibleApps().length, APP_CATALOG.length - 6);

  assert.equal(os.prevPage(), true);
  assert.equal(os.page, 0);

  os.setCategory('games');
  assert.equal(os.page, 0);
  assert.equal(os.getFilteredApps().length, 2);
  assert.equal(os.getTotalPages(), 1);
  assert.equal(os.nextPage(), false);

  os.markAppOpened('browser');
  os.markAppOpened('calculator');
  assert.equal(os.isAppOpen('browser'), true);
  assert.deepEqual(os.getOpenAppIds(), ['browser', 'calculator']);
  os.markAppClosed('browser');
  assert.equal(os.isAppOpen('browser'), false);
});

test('Responsive mobile base scaling and window scale clamping', () => {
  assert.equal(getResponsiveBaseScale(390, 844), 0.78);
  assert.equal(getResponsiveBaseScale(768, 900), 0.86);
  assert.equal(getResponsiveBaseScale(1440, 900), 1);

  assert.equal(clampWindowScale(0.2), MIN_WINDOW_SCALE);
  assert.equal(clampWindowScale(3.5), MAX_WINDOW_SCALE);
  assert.equal(clampWindowScale(0.87), 0.87);
  assert.equal(clampWindowScale(Number.NaN), 1);
});

test('evaluateHorizontalSwipe detects left/right flicks and ignores jitter', () => {
  assert.equal(evaluateHorizontalSwipe(-80, 45), 1);
  assert.equal(evaluateHorizontalSwipe(80, 45), -1);
  assert.equal(evaluateHorizontalSwipe(20, 45), 0);
  assert.equal(evaluateHorizontalSwipe(NaN, 45), 0);
});

test('computeWindowArcSlot separates simultaneous windows', () => {
  const s0 = computeWindowArcSlot(0);
  const s1 = computeWindowArcSlot(1);
  const s2 = computeWindowArcSlot(2);
  assert.notEqual(s0.angleRad, s1.angleRad);
  assert.notEqual(s1.angleRad, s2.angleRad);
});

test('BrowserLogic normalizes URLs, search queries, and history stack', () => {
  assert.equal(normalizeBrowserInput(''), 'foldxr://home');
  assert.equal(normalizeBrowserInput('example.com'), 'https://example.com');
  assert.equal(
    normalizeBrowserInput('https://threejs.org'),
    'https://threejs.org'
  );
  assert.equal(
    normalizeBrowserInput('Космос и WebXR'),
    'search://%D0%9A%D0%BE%D1%81%D0%BC%D0%BE%D1%81%20%D0%B8%20WebXR'
  );

  const wikiRu = buildWikipediaSummaryEndpoint('%D0%9A%D0%BE%D1%81%D0%BC%D0%BE%D1%81');
  assert.match(wikiRu.apiUrl, /^https:\/\/ru\.wikipedia\.org\//);

  const history = new BrowserHistory();
  assert.equal(history.canGoBack, false);
  history.push('https://threejs.org');
  history.push('Android XR');
  assert.equal(history.canGoBack, true);
  assert.equal(history.back(), 'https://threejs.org');
  assert.equal(history.canGoForward, true);
  assert.equal(history.forward(), 'search://Android%20XR');
});

test('BrowserHtmlParser validates external URLs and parses HTML + DuckDuckGo results', () => {
  assert.ok(validateSafeExternalUrl('https://habr.com/ru/news/'));
  assert.equal(validateSafeExternalUrl('http://localhost:3000/test'), null);
  assert.equal(validateSafeExternalUrl('http://127.0.0.1/admin'), null);
  assert.equal(validateSafeExternalUrl('http://192.168.1.10'), null);
  assert.equal(validateSafeExternalUrl('javascript:alert(1)'), null);

  const sampleHtml = `
    <html>
      <head>
        <title>WebXR News Portal</title>
        <meta name="description" content="Latest spatial computing updates" />
        <script>console.log("ignore me");</script>
      </head>
      <body>
        <main>
          <h1>Spatial Computing in WebXR</h1>
          <p>Modern browsers on foldable devices support WebXR sessions and spatial windows.</p>
          <a href="/articles/fold-xr">Read full Fold XR guide</a>
          <a href="#top">Jump to top</a>
        </main>
      </body>
    </html>
  `;
  const parsed = parseHtmlToReadablePage(sampleHtml, 'https://example.org/news');
  assert.equal(parsed.title, 'WebXR News Portal');
  assert.equal(parsed.description, 'Latest spatial computing updates');
  assert.equal(parsed.paragraphs.length, 2);
  assert.equal(parsed.links.length, 1);
  assert.equal(parsed.links[0].url, 'https://example.org/articles/fold-xr');

  const ddgHtml = `
    <div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fthreejs.org%2Fdocs">Three.js Docs</a>
      <div class="result__snippet">Official Three.js documentation and WebXR guides.</div>
    </div>
  `;
  const ddg = parseDuckDuckGoResults(ddgHtml);
  assert.equal(ddg.length, 1);
  assert.equal(ddg[0].url, 'https://threejs.org/docs');
  assert.equal(ddg[0].label, 'Three.js Docs');
});

test('CalculatorLogic evaluates expressions safely and handles errors', () => {
  assert.equal(evaluateMathExpression('12 + 3 * (4 - 1)'), 21);
  assert.equal(evaluateMathExpression('-5 + 10 / 2'), 0);
  assert.equal(evaluateMathExpression('10 / 0'), null);

  const calc = new CalculatorLogic();
  calc.inputDigit('7');
  calc.inputOperator('*');
  calc.inputDigit('8');
  assert.equal(calc.evaluate(), '56');
  calc.inputDigit('2');
  assert.equal(calc.expression, '2');
});

test('OrbitalShooterLogic handles waves, combo scoring, and game over', () => {
  const shooter = new OrbitalShooterLogic(() => 0.5);
  shooter.startGame();
  assert.equal(shooter.running, true);
  assert.equal(shooter.targets.length, 4);

  const firstId = shooter.targets[0].id;
  const hit = shooter.hitTarget(firstId);
  assert.equal(hit.destroyed, true);
  assert.equal(shooter.score, 100);
  assert.equal(shooter.combo, 2);

  for (const t of shooter.targets.slice(1)) {
    shooter.hitTarget(t.id);
  }
  const stepResult = shooter.step(0.1, 1);
  assert.equal(stepResult.waveCleared, true);
  assert.equal(shooter.wave, 2);

  shooter.step(100, 101);
  assert.equal(shooter.running, false);
  assert.equal(shooter.gameOver, true);
});

test('MemoryMatrixLogic validates sequences and level progression', () => {
  let step = 0;
  const seqVals = [0.1, 0.5, 0.8];
  const game = new MemoryMatrixLogic(() => seqVals[step++ % seqVals.length]);
  const seq1 = game.start();
  assert.equal(seq1.length, 1);
  assert.equal(game.phase, 'showing');
  game.finishShowing();
  assert.equal(game.phase, 'input');
  assert.equal(game.submitCell(seq1[0]), 'level-complete');

  const seq2 = game.advanceLevel();
  assert.equal(seq2.length, 2);
  game.finishShowing();
  assert.equal(game.submitCell((seq2[0] + 1) % 9), 'wrong');
  assert.equal(game.phase, 'gameover');
});
