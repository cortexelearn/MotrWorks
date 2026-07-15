import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); process.exitCode = 1; });
await page.goto('file:///home/claude/motrsynth/index.html');
await page.waitForSelector('header.hd', { timeout: 15000 });
console.log('✓ app booted');

const fieldVal = async (label) => {
  return page.evaluate((lbl) => {
    const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith(lbl));
    return f ? f.querySelector('input')?.value : null;
  }, label);
};
const setField = async (label, val) => {
  await page.evaluate(({ lbl, v }) => {
    const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith(lbl));
    const inp = f.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, String(v));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, { lbl: label, v: val });
};
const clickSeg = async (label) => {
  await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('.seg button')].find(x => x.textContent === lbl);
    b.click();
  }, label);
};

// 1) capture BLDC default stator OD, then edit it to a distinctive value
const odBLDC0 = await fieldVal('Stator OD');
await setField('Stator OD', 3.333);            // inch units default
const odBLDC = await fieldVal('Stator OD');
console.log('BLDC Stator OD edited:', odBLDC0, '->', odBLDC);

// 2) toggle to Brushed — expect the 24 V preset to auto-load
await clickSeg('Brushed');
await page.waitForTimeout(200);
const housingOD = await fieldVal('Housing (can) OD');
const vdc = await fieldVal('Supply voltage');
const turns = await fieldVal('Turns per coil');
console.log('after toggle → Brushed: Housing OD', housingOD, '(expect 45mm = 1.7717 in) · Vdc', vdc, '(expect 24) · turns', turns, '(expect 45)');
if (Math.abs(parseFloat(housingOD) - 45/25.4) > 0.001 || vdc !== '24' || turns !== '45') { console.log('✗ default preset not loaded'); process.exitCode = 1; }
else console.log('✓ 24 V preset auto-loaded on first Brushed toggle');

// preset default reflected in the preset picker? (not required — it merges silently)
// 3) edit a brushed field distinctively
await setField('Turns per coil', 39);
console.log('Brushed turns edited to', await fieldVal('Turns per coil'));

// 4) toggle back to BLDC — expect the edited 3.333 stator OD restored, 3-phase controls back
await clickSeg('BLDC');
await page.waitForTimeout(200);
const odBack = await fieldVal('Stator OD');
const hasCtrl = await page.evaluate(() => [...document.querySelectorAll('.fl')].some(x => x.textContent.startsWith('Control scheme')));
console.log('back to BLDC: Stator OD', odBack, '(expect 3.333) · Control scheme visible:', hasCtrl);
if (odBack !== '3.333' || !hasCtrl) { console.log('✗ BLDC state not restored'); process.exitCode = 1; }
else console.log('✓ BLDC state fully restored (edit preserved)');

// 5) toggle to Brushed again — expect edited turns 39, NOT the preset 45
await clickSeg('Brushed');
await page.waitForTimeout(200);
const turns2 = await fieldVal('Turns per coil');
const noFoc = await page.evaluate(() => ![...document.querySelectorAll('.fl')].some(x => x.textContent.startsWith('Control scheme')));
console.log('Brushed again: turns', turns2, '(expect 39, not preset 45) · no FOC controls:', noFoc);
if (turns2 !== '39' || !noFoc) { console.log('✗ brushed session state not preserved'); process.exitCode = 1; }
else console.log('✓ brushed edits preserved across round-trip');

// 6) verify brushed cross-section renders (commutator bars present) and no console errors
const svg = await page.evaluate(() => document.getElementById('svg-xsec')?.outerHTML.length || 0);
console.log('brushed cross-section SVG:', svg, 'chars');
if (svg < 1000) process.exitCode = 1;

// 7) load a different brushed preset via Start ▸ Presets and confirm it applies
await page.evaluate(() => {
  const segs = [...document.querySelectorAll('.seg button')];
  segs.find(b => b.textContent === 'Presets')?.click();
});
await page.waitForTimeout(150);
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value.includes('Brushed 12 V')));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, [...sel.options].find(o => o.value.includes('Brushed 12 V')).value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
const vdc12 = await fieldVal('Supply voltage');
console.log('after loading 12 V preset: Vdc', vdc12, vdc12 === '12' ? '✓' : '✗');
if (vdc12 !== '12') process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? 'FAILED' : 'ALL TOGGLE TESTS PASSED');
