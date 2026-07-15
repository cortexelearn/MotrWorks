// SSR gate: render the EXACT shipped app block with react-dom/server
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
const React = require('react');
const { renderToString } = require('react-dom/server');
globalThis.React = React;
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };

const html = readFileSync('index.html', 'utf8');
const i0 = html.indexOf('<script>/*APP*/') + '<script>/*APP*/'.length;
const i1 = html.indexOf('</script>\n<script>/*BOOT*/');
let app = html.slice(i0, i1).replace(/<\\\/script/g, '</script');
writeFileSync('/tmp/_shipped.js', app);
// evaluate the shipped block, capture MotorDesigner
const fn = new Function('React', app + '\nreturn MotorDesigner;');
const MotorDesigner = fn(React);
const out = renderToString(React.createElement(MotorDesigner));
console.log('SSR OK — rendered', out.length, 'chars');
// smoke-check brushed markers exist in code
for (const m of ['BrushedSection','BrushedSlotDetail','Armature slots','Commutator bars','armature reaction']) {
  if (!app.includes(m)) { console.error('MISSING MARKER:', m); process.exit(1); }
}
console.log('brushed markers present');
