# MotrSynth verification tools

Session-portable gates and e2e tests. All run from the repo root (they read `index.html` relative):

    cp tools/_base.json /tmp/_base.json     # default-parameter base; gates read it from /tmp
    cp tools/*.mjs /tmp/                    # (scripts also work run from tools/ if _base path is edited)
    node /tmp/ssr-gate.mjs                  # server-side render sanity — REQUIRED before any deploy
                                            # healthy default render: 151,225 chars

Build:  export PATH=$PATH:/home/claude/.npm-global/bin && python3 build.py
        (regenerate src/motor-designer.concat.jsx from the numbered src modules first)

Gates (pure compute, fast):
  ssr-gate, brushed-gate, dxf-gate, latm-gate, latm-preset-gate,
  stp-gate, stp-preset-gate, wind-gate, brk-gate (37 checks), brk-preset-gate (4 presets),
  env-gate (envelope wizard synthesis for all six machine types + half-gauge wire grid),
  act-gate (Actuator composition math + view SSR)

E2E (Playwright/Chromium against file://index.html):
  toggle-test, stp-e2e, filter-e2e, latm-e2e, wind-e2e, brk-e2e

Tuners / renderers:
  brk-tune3.mjs  — multi-target brake preset sweep (margin ≥1.4, Tcu ≤118 °C, clearance ≥0.6 mm)
  brk-render.mjs — dumps brake face + axial SVGs to /tmp for raster verification
                   (merge duplicate svg style attrs before sharp: see session notes)

IMPORTANT: keep tools/_base.json in sync whenever a new parameter is added to the app's
initial state — stale keys silently become NaN in gate runs.
