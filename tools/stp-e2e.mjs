import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto('file:///home/claude/motrsynth/index.html');
await page.waitForSelector('header.hd', { timeout: 15000 });

const clickSeg = (label) => page.evaluate((lbl) => {
  const b = [...document.querySelectorAll('.seg button')].find(x => x.textContent === lbl);
  if (!b) throw new Error('seg not found: ' + lbl); b.click();
}, label);
const fieldVal = (labelStart) => page.evaluate((ls) => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith(ls));
  return f?.querySelector('input')?.value ?? null;
}, labelStart);
const cardTitles = () => page.evaluate(() => [...document.querySelectorAll('.card h2')].map(h => h.textContent));
const kvVal = (label) => page.evaluate((lb) => {
  const kv = [...document.querySelectorAll('.kv')].find(x => x.querySelector('span')?.textContent === lb);
  return kv?.querySelector('b')?.textContent ?? null;
}, label);

// remember BLDC state for memory round-trip
const bldcSlots = await fieldVal('Slots');

// toggle to Stepper: NEMA17 default auto-loads
await clickSeg('Step'); await page.waitForTimeout(300);
const vdc = await fieldVal('Supply voltage'), turns = await fieldVal('Turns per pole');
console.log(`stepper default: Vdc ${vdc} (24) · turns/pole ${turns} (36): ${vdc==='24'&&turns==='36'?'✓':'✗'}`);
if (vdc !== '24' || turns !== '36') process.exitCode = 1;

// preset list: only 4 stepper presets
await page.evaluate(() => { [...document.querySelectorAll('.seg button')].find(b => b.textContent === 'Presets')?.click(); });
await page.waitForTimeout(150);
const opts = await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value.includes('choose a preset')));
  return sel ? [...sel.options].map(o => o.value).slice(1) : [];
});
const pOK = opts.length === 4 && opts.every(o => /NEMA|PM stepper/.test(o));
console.log(`stepper presets listed: ${opts.length} (expect 4, stepper-only): ${pOK?'✓':'✗ '+opts.join(' | ')}`);
if (!pOK) process.exitCode = 1;

// cards: stepper output + torque-angle present; 3-phase cards hidden
const titles = await cardTitles();
const has = (s) => titles.some(t => t.includes(s));
const cOK = has('Stepper output') && has('Torque vs angle') &&
  !has('Coil build') && !has('Slot detail') && titles.every(t => t !== 'Electrical') && !has('Torque–speed');
console.log(`cards show/hide: ${cOK?'✓':'✗ '+titles.join(' | ')}`);
if (!cOK) process.exitCode = 1;

// lamination labels
const polesLbl = await page.evaluate(() => [...document.querySelectorAll('.fl')].some(l => l.textContent.startsWith('Stator poles')));
const bodyLbl = await page.evaluate(() => [...document.querySelectorAll('.fl')].some(l => l.textContent.startsWith('Pole body width')));
console.log(`labels Stator poles/Pole body width: ${polesLbl&&bodyLbl?'✓':'✗'}`);
if (!polesLbl || !bodyLbl) process.exitCode = 1;

// torque-angle chart renders with curves
const tang = await page.evaluate(() => {
  const s = document.getElementById('svg-tang');
  return s ? s.querySelectorAll('path').length : 0;
});
console.log(`svg-tang paths: ${tang} (≥3 curves): ${tang>=3?'✓':'✗'}`);
if (tang < 3) process.exitCode = 1;

// R changes live with wiring (series -> parallel = ÷4)
const rSer = await kvVal('R / L per phase');
await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Drive wiring'));
  const b = [...f.querySelectorAll('.seg button')].find(x => x.textContent.includes('parallel'));
  b.click();
});
await page.waitForTimeout(200);
const rPar = await kvVal('R / L per phase');
const rs = parseFloat(rSer), rp = parseFloat(rPar);
console.log(`wiring R live: series ${rs} Ω -> parallel ${rp} Ω (ratio ${(rs/rp).toFixed(1)}, expect 4): ${Math.abs(rs/rp-4)<0.1?'✓':'✗'}`);
if (Math.abs(rs/rp - 4) > 0.1) process.exitCode = 1;

// Play animation steps the rotor
await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('▶'))?.click(); });
const rot0 = await page.evaluate(() => document.querySelector('#svg-xsec g[transform*="rotate"]')?.getAttribute('transform'));
await page.waitForTimeout(1300);
const rot1 = await page.evaluate(() => document.querySelector('#svg-xsec g[transform*="rotate"]')?.getAttribute('transform'));
const legend = await page.evaluate(() => [...document.querySelectorAll('#svg-xsec text')].some(t => t.textContent.startsWith('energized:')));
console.log(`Play stepping: transform ${rot0 !== rot1 ? 'advances ✓' : '✗ static'} · phase legend: ${legend?'✓':'✗'}`);
if (rot0 === rot1 || !legend) process.exitCode = 1;
await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('❚❚') || b.textContent.includes('▶'))?.click(); });

// memory round-trip BLDC <-> stepper
await clickSeg('BLDC'); await page.waitForTimeout(250);
const backSlots = await fieldVal('Slots');
await clickSeg('Step'); await page.waitForTimeout(250);
const wireBack = await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Drive wiring'));
  return [...f.querySelectorAll('.seg button')].find(b => b.className.includes('on'))?.textContent;
});
console.log(`memory: BLDC slots restored ${backSlots} (${bldcSlots}) · stepper wiring kept "${wireBack}": ${backSlots===bldcSlots&&wireBack?.includes('parallel')?'✓':'✗'}`);
if (backSlots !== bldcSlots || !wireBack?.includes('parallel')) process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL STEPPER E2E PASSED');
