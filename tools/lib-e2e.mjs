// Design-library round trip through the real UI: save, change the design, compare,
// load back, delete, and confirm persistence across a reload.
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/playwright/');
const { chromium } = require('playwright');
let fail = 0;
const ok = (c, what, d) => { console.log(`${c ? '✓' : '✗'} ${what}${d ? ': ' + d : ''}`); if (!c) fail++; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); fail++; });
await page.goto(pathToFileURL('index.html').href);
await page.waitForSelector('header.hd', { timeout: 15000 });

const libCard = () => page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent === 'Design library');
  return c ? { rows: [...c.querySelectorAll('.kv')].map(k => k.textContent), html: c.innerHTML.length } : null;
});
const setField = async (label, val) => page.evaluate(({ lbl, v }) => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith(lbl));
  const inp = f?.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, String(v));
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}, { lbl: label, v: val });

ok(!!(await libCard()), 'library card renders');

// name and save the stock design
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent === 'Design library');
  const inp = c.querySelector('input[type=text]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'baseline');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(120);
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent === 'Design library');
  [...c.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save current').click();
});
await page.waitForTimeout(250);
let card = await libCard();
ok(card.rows.some(t => t.includes('baseline')), 'design saved into the library');

// change the design, then compare the saved entry against it
await setField('Turns per coil', 4);
await page.waitForTimeout(300);
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent === 'Design library');
  c.querySelector('input[type=checkbox]').click();
});
await page.waitForTimeout(300);
card = await libCard();
const ktRow = card.rows.find(t => t.startsWith('Kt'));
ok(!!ktRow, 'comparison table appears', ktRow);
// row reads "<current> now<saved>" — Kt is linear in turns, so doubling turns must
// show the saved (2-turn) entry at half the current (4-turn) value
const nums = (ktRow || '').match(/\d+\.\d+/g) || [];
ok(nums.length >= 2 && Math.abs(parseFloat(nums[0]) / parseFloat(nums[1]) - 2) < 0.02,
  'saved design compares against the changed current design (2x turns -> 2x Kt)',
  `${nums[0]} current vs ${nums[1]} saved`);

// load it back and confirm the parameter returns
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent === 'Design library');
  [...c.querySelectorAll('button')].find(b => b.textContent.trim() === 'Load').click();
});
await page.waitForTimeout(350);
const turns = await page.evaluate(() => {
  const f = [...document.querySelectorAll('.field')].find(x => x.querySelector('.fl')?.textContent.startsWith('Turns per coil'));
  return f?.querySelector('input')?.value;
});
ok(turns === '2', 'loading restores the saved parameters', `turns now ${turns}`);

// persistence across reload
await page.reload();
await page.waitForSelector('header.hd', { timeout: 15000 });
await page.waitForTimeout(400);
card = await libCard();
ok(card.rows.some(t => t.includes('baseline')), 'library survives a reload (localStorage)');

// delete
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent === 'Design library');
  [...c.querySelectorAll('button')].find(b => b.textContent.trim() === '✕').click();
});
await page.waitForTimeout(250);
card = await libCard();
ok(!card.rows.some(t => t.includes('baseline')), 'entry deleted');

await browser.close();
console.log(fail ? `LIBRARY E2E: ${fail} FAILED` : 'LIBRARY E2E: ALL PASSED');
process.exit(fail ? 1 : 0);
