import { createRequire } from 'module';
import { pathToFileURL } from 'url';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto(pathToFileURL('index.html').href); // repo-root index.html, portable across platforms
await page.waitForSelector('header.hd', { timeout: 15000 });
console.log('✓ app booted');

const clickSeg = (label) => page.evaluate((lbl) => {
  const b = [...document.querySelectorAll('.seg button')].find(x => x.textContent === lbl);
  if (!b) throw new Error('seg not found: ' + lbl); b.click();
}, label);
const hasText = (t) => page.evaluate((s) => document.body.innerText.includes(s), t);
const hasField = (lbl) => page.evaluate((l) => [...document.querySelectorAll('.fl')].some(x => x.textContent.startsWith(l)), lbl);

// toggle to LATM (first visit: carries current params with motorType change)
await clickSeg('LATM');
await page.waitForTimeout(250);

// cards that must appear
for (const t of ['LATM output (two-position toggle)', 'Torque vs angle', 'Toggle / holding torque @ stops',
                 'Travel between stops', 'Torque-reversal angle']) {
  const ok = await hasText(t);
  console.log((ok ? '  ✓ ' : '  ✗ ') + JSON.stringify(t) + (ok ? ' present' : ' MISSING'));
  if (!ok) process.exitCode = 1;
}
// cards that must be hidden
for (const t of ['Torque–speed curve', 'Coil build & end turns', 'Slot detail & insertion map', 'Electrical']) {
  const gone = !(await hasText(t));
  console.log((gone ? '  ✓ ' : '  ✗ ') + JSON.stringify(t) + (gone ? ' hidden' : ' STILL VISIBLE'));
  if (!gone) process.exitCode = 1;
}
// slot fields hidden, latm labels shown
for (const [lbl, want] of [['Tooth width', false], ['Slot opening', false], ['Toroid core OD', true],
                           ['Rotor poles', true], ['Travel between stops', true]]) {
  const got = await hasField(lbl);
  console.log((got === want ? '  ✓ ' : '  ✗ ') + 'field ' + JSON.stringify(lbl) + (want ? ' shown' : ' hidden'));
  if (got !== want) process.exitCode = 1;
}
// torque-angle svg rendered
const tang = await page.evaluate(() => document.getElementById('svg-tang')?.outerHTML.length || 0);
console.log('  torque-angle SVG:', tang, 'chars', tang > 2000 ? '✓' : '✗');
if (tang < 2000) process.exitCode = 1;
// cross-section is the LATM view (striations present = many copper line elements)
const stri = await page.evaluate(() => document.getElementById('svg-xsec')?.querySelectorAll('line[stroke="#B87333"]').length || 0);
console.log('  toroid striations in cross-section:', stri, stri > 20 ? '✓' : '✗');
if (stri < 20) process.exitCode = 1;

// Play: rotor transform changes over time
await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('▶'))?.click(); });
await page.waitForTimeout(120);
const rot1 = await page.evaluate(() => document.getElementById('svg-xsec')?.querySelector('g[transform^="rotate"]')?.getAttribute('transform'));
await page.waitForTimeout(600);
const rot2 = await page.evaluate(() => document.getElementById('svg-xsec')?.querySelector('g[transform^="rotate"]')?.getAttribute('transform'));
console.log('  Play toggle animation:', rot1, '→', rot2, rot1 !== rot2 ? '✓' : '✗');
if (rot1 === rot2) process.exitCode = 1;

// round-trip memory: back to BLDC and return
await clickSeg('BLDC');
await page.waitForTimeout(200);
const focBack = await hasField('Control scheme');
console.log('  back to BLDC, FOC controls:', focBack ? '✓' : '✗');
await clickSeg('LATM');
await page.waitForTimeout(200);
const stillLatm = await hasText('LATM output (two-position toggle)');
console.log('  LATM restored from memory:', stillLatm ? '✓' : '✗');
if (!focBack || !stillLatm) process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL LATM E2E TESTS PASSED');
