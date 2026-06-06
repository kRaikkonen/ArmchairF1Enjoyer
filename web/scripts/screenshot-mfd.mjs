const pwPath = process.env.PW_PKG || 'playwright';
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;

const BASE = process.env.BASE || 'http://localhost:5174';
const OUT = process.env.OUT || '/tmp/mfd.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

if (process.env.FLOW === 'home') {
  // New entry flow: Home → pick a race → straight into the MFD.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Bahrain/ }).click();
  await page.waitForTimeout(1200);
} else {
  // Share URL → auto-restores Bahrain, runs simulate(), shows result page.
  await page.goto(`${BASE}/?track=bahrain&season=2025&player=VER&seed=42`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /策略推演台/ }).click();
  await page.waitForTimeout(900);
}

// Optionally scrub the global lap slider (first range input, in the HUD).
if (process.env.WHATIF) {
  // Inject a What-If: 60s penalty on the controlled driver, then re-simulate.
  await page.getByRole('button', { name: /罚时/ }).click();
  await page.waitForTimeout(150);
  const penBox = page.locator('aside input[type=number]').first();
  await penBox.fill('60');
  await page.getByRole('button', { name: /重新推演/ }).click();
  await page.waitForTimeout(900);
}

if (process.env.LAP) {
  await page.evaluate((lap) => {
    const el = document.querySelector('header input[type=range]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(lap));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, process.env.LAP);
  await page.waitForTimeout(500);
}

await page.screenshot({ path: OUT });
console.log('saved', OUT);
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
else console.log('no page errors');
await browser.close();
