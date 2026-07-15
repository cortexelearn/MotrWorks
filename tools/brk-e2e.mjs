import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto('file:///home/claude/motrsynth/index.html');
await page.waitForSelector('header.hd', { timeout: 15000 });
const clickSeg = (l) => page.evaluate((lbl) => {
  [...document.querySelectorAll('.seg button')].find(x => x.textContent === lbl).click(); }, l);

// tab order: Brake last
const tabs = await page.evaluate(() => {
  const seg = [...document.querySelectorAll('.seg')].find(s => [...s.querySelectorAll('button')].some(b => b.textContent === 'Brake'));
  return [...seg.querySelectorAll('button')].map(b => b.textContent);
});
console.log(`tab order: ${tabs.join(' · ')} — Brake last: ${tabs[tabs.length-1] === 'Brake' ? '✓' : '✗'}`);
if (tabs[tabs.length-1] !== 'Brake') process.exitCode = 1;

// toggle: preset auto-loads
await clickSeg('Brake'); await page.waitForTimeout(300);
const vals = await page.evaluate(() => {
  const g = (ls) => { const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith(ls));
    return f?.querySelector('input')?.value ?? null; };
  return { od: g('Backiron OD'), spring: g('Spring clamp force'), turns: g('Coil turns') };
});
const odOK = vals.od === '60' || Math.abs(parseFloat(vals.od) - 2.3622) < 0.001;  // unit-aware field (inch default)
console.log(`brake default: OD ${vals.od} (60 mm / 2.3622 in) · spring ${vals.spring} (200) · turns ${vals.turns} (650): ${odOK&&vals.spring==='200'&&vals.turns==='650'?'✓':'✗'}`);
if (!odOK || vals.spring !== '200' || vals.turns !== '650') process.exitCode = 1;

// cards: brake output present; lamination/slot/electrical/coil-build hidden
const titles = await page.evaluate(() => [...document.querySelectorAll('.card h2')].map(h => h.textContent));
const has = (s) => titles.some(t => t.includes(s));
const cOK = has('Brake output') && !has('Lamination geometry') && !has('Slot detail') && !has('Coil build') && titles.every(t => t !== 'Electrical');
console.log(`cards show/hide: ${cOK ? '✓' : '✗ ' + titles.join(' | ')}`);
if (!cOK) process.exitCode = 1;

// material autofill: sintered bronze -> µs 0.32
await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Friction material'));
  const sel = f.querySelector('select');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, [...sel.options].find(o => /bronze/i.test(o.value)).value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
const mu = await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Static friction'));
  return f?.querySelector('input')?.value;
});
console.log(`material autofill: bronze → µs ${mu} (0.32): ${mu === '0.32' ? '✓' : '✗'}`);
if (mu !== '0.32') process.exitCode = 1;
// µ stays editable (secondary override)
await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Static friction'));
  const inp = f.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '0.5'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
const torque = await page.evaluate(() => {
  const kv = [...document.querySelectorAll('.kv')].find(x => x.querySelector('span')?.textContent === 'Static holding torque');
  return kv?.querySelector('b')?.textContent;
});
console.log(`µ override live → torque updates: "${torque}" ${torque && !torque.includes('—') ? '✓' : '✗'}`);
if (!torque) process.exitCode = 1;

// axial Play toggles power state
await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('▶'))?.click(); });
const states = new Set();
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(450);
  const s = await page.evaluate(() => [...document.querySelectorAll('svg text')].map(t => t.textContent).find(t => t.startsWith('POWER')));
  if (s) states.add(s.slice(0, 8));
}
console.log(`Play toggles power states seen: ${[...states].join(' / ')} ${states.size === 2 ? '✓' : '✗'}`);
if (states.size !== 2) process.exitCode = 1;

// preset list filtered
await page.evaluate(() => { [...document.querySelectorAll('.seg button')].find(b => b.textContent === 'Presets')?.click(); });
await page.waitForTimeout(150);
const opts = await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value.includes('choose a preset')));
  return sel ? [...sel.options].map(o => o.value).slice(1) : [];
});
console.log(`brake presets: ${opts.length} listed (4), brake-only: ${opts.length === 4 && opts.every(o => o.startsWith('Brake')) ? '✓' : '✗ ' + opts.join('|')}`);
if (opts.length !== 4 || !opts.every(o => o.startsWith('Brake'))) process.exitCode = 1;

// memory round-trip
await clickSeg('BLDC'); await page.waitForTimeout(250);
await clickSeg('Brake'); await page.waitForTimeout(250);
const muBack = await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Static friction'));
  return f?.querySelector('input')?.value;
});
console.log(`memory: µ override kept through BLDC round-trip: ${muBack} (0.5): ${muBack === '0.5' ? '✓' : '✗'}`);
if (muBack !== '0.5') process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL BRAKE E2E PASSED');
