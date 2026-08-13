import { createRequire } from 'module';
import { pathToFileURL } from 'url';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto(pathToFileURL('index.html').href); // repo-root index.html, portable across platforms
await page.waitForSelector('header.hd', { timeout: 15000 });

const clickSeg = (label) => page.evaluate((lbl) => {
  const b = [...document.querySelectorAll('.seg button')].find(x => x.textContent === lbl);
  if (!b) throw new Error('seg not found: ' + lbl); b.click();
}, label);
const presetOpts = () => page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value.includes('choose a preset')));
  return sel ? [...sel.options].map(o => o.value).slice(1) : [];
});
const openPresets = async () => { await page.evaluate(() => {
  [...document.querySelectorAll('.seg button')].find(b => b.textContent === 'Presets')?.click(); }); await page.waitForTimeout(120); };

// BLDC: only pm presets
await openPresets();
let opts = await presetOpts();
let ok = opts.length > 0 && opts.every(o => !/Brushed|LATM|ACIM|induction/i.test(o) || /BLDC/i.test(o));
console.log(`BLDC presets: ${opts.length} listed · pm-only: ${ok ? '✓' : '✗ ' + opts.join(' | ')}`);
if (!ok) process.exitCode = 1;

// Brushed — count re-anchored to 7 at v58.1 (PM 8->13, brushed 4->7); filtering test unchanged
await clickSeg('Brushed'); await page.waitForTimeout(200); await openPresets();
opts = await presetOpts();
ok = opts.length === 7 && opts.every(o => o.startsWith('Brushed'));
console.log(`Brushed presets: ${opts.length} listed (expect 7, all Brushed): ${ok ? '✓' : '✗ ' + opts.join(' | ')}`);
if (!ok) process.exitCode = 1;

// LATM: default auto-load + 3 presets
await clickSeg('LATM'); await page.waitForTimeout(250);
const vdc = await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Supply voltage'));
  return f?.querySelector('input')?.value;
});
const turns = await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Turns / sector'));
  return f?.querySelector('input')?.value;
});
console.log(`LATM default auto-loaded: Vdc ${vdc} (expect 28) · turns/sector ${turns} (expect 207): ${vdc === '28' && turns === '207' ? '✓' : '✗'}`);
if (vdc !== '28' || turns !== '207') process.exitCode = 1;
await openPresets();
opts = await presetOpts();
ok = opts.length === 3 && opts.every(o => o.startsWith('LATM'));
console.log(`LATM presets: ${opts.length} listed (expect 3, all LATM): ${ok ? '✓' : '✗ ' + opts.join(' | ')}`);
if (!ok) process.exitCode = 1;

// ACIM: cage bars visible, copper variant recolors
await clickSeg('ACIM'); await page.waitForTimeout(250);
let alu = await page.evaluate(() => document.getElementById('svg-xsec')?.querySelectorAll('rect[fill="#C7CDD4"]').length || 0);
console.log(`ACIM cage bars (aluminum rects): ${alu} (expect 2×rotorBars): ${alu >= 8 && alu % 2 === 0 ? '✓' : '✗'}`);
if (alu < 8) process.exitCode = 1;
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /copper/i.test(o.value)));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, [...sel.options].find(o => /copper/i.test(o.value)).value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
const cu = await page.evaluate(() => document.getElementById('svg-xsec')?.querySelectorAll('rect[fill="#B87333"]').length || 0);
console.log(`copper cage recolors: ${cu} copper rects: ${cu >= 8 ? '✓' : '✗'}`);
if (cu < 8) process.exitCode = 1;
// ACIM presets filtered
await openPresets();
opts = await presetOpts();
ok = opts.every(o => !o.startsWith('Brushed') && !o.startsWith('LATM'));
console.log(`ACIM presets: ${opts.length} listed · induction-only: ${ok ? '✓' : '✗ ' + opts.join(' | ')}`);
if (!ok) process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL FILTER/CAGE E2E TESTS PASSED');
