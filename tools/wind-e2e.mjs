import { createRequire } from 'module';
import { pathToFileURL } from 'url';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto(pathToFileURL('index.html').href); // repo-root index.html, portable across platforms
await page.waitForSelector('header.hd', { timeout: 15000 });
const clickSeg = (l) => page.evaluate((lbl) => {
  [...document.querySelectorAll('.seg button')].find(x => x.textContent === lbl).click(); }, l);

// Brushed: developed diagram + T/B chips in the slot card
await clickSeg('Brushed'); await page.waitForTimeout(300);
const br = await page.evaluate(() => {
  const svg = document.getElementById('svg-winding');
  const chips = [...document.querySelectorAll('.chip')].map(c => c.textContent);
  return { svg: !!svg, polylines: svg ? svg.querySelectorAll('polyline').length : 0,
    dev: svg ? svg.textContent.includes('developed view') : false,
    tb: chips.filter(c => /T\d+ ?B\d+/.test(c)).length };
});
console.log(`brushed: svg-winding ${br.svg?'✓':'✗'} · developed label ${br.dev?'✓':'✗'} · ${br.polylines} coil polylines · ${br.tb} T/B slot chips`);
if (!br.svg || !br.dev || br.polylines < 8 || br.tb < 4) process.exitCode = 1;

// Stepper: pole coils card + chips + wiring text follows the pick
await clickSeg('Step'); await page.waitForTimeout(300);
const st1 = await page.evaluate(() => {
  const h = [...document.querySelectorAll('.card h2')].some(x => x.textContent === 'Pole coils & connections');
  const svg = document.getElementById('svg-winding');
  const chips = [...document.querySelectorAll('.chip')].map(c => c.textContent);
  return { h, svg: !!svg, ser: svg ? svg.textContent.includes('bipolar series') : false,
    poleChips: chips.filter(c => /[AB][+−]/.test(c)).length };
});
console.log(`stepper: card ${st1.h?'✓':'✗'} · diagram ${st1.svg?'✓':'✗'} · series note ${st1.ser?'✓':'✗'} · ${st1.poleChips} pole chips (8)`);
if (!st1.h || !st1.svg || !st1.ser || st1.poleChips !== 8) process.exitCode = 1;
await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Drive wiring'));
  [...f.querySelectorAll('.seg button')].find(x => x.textContent === 'Unipolar').click();
});
await page.waitForTimeout(200);
const uni = await page.evaluate(() => document.getElementById('svg-winding')?.textContent.includes('center tap'));
console.log(`wiring pick → diagram updates to unipolar/center tap: ${uni?'✓':'✗'}`);
if (!uni) process.exitCode = 1;
await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL WINDING E2E PASSED');
