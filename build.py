#!/usr/bin/env python3
"""MotrWorks build: concatenate src modules -> transpile JSX (tsc) -> inline into index.html.
Requires: python3, node + typescript (npm i -g typescript), and react-bundle.js (prebuilt React runtime).
Usage: python3 build.py"""
import subprocess, re, os, sys

MODULES = ["01-shared.jsx", "02-engine.js", "03-dxf-import.js", "04-views.jsx", "05-app.jsx"]
src = ""
for m in MODULES:
    t = open(os.path.join("src", m)).read()
    t = re.sub(r"^/\* Motr(Works|Synth) module.*?\*/\n", "", t, count=1)  # strip module header
    src += t
src = src.replace('import React, { useMemo, useState, useEffect, useContext, createContext } from "react";',
                  "const { useMemo, useState, useEffect, useContext, createContext } = React;")
src = src.replace("export default function MotorDesigner()", "function MotorDesigner()")
open("_appsrc.tsx", "w").write(src)
subprocess.run(["tsc", "--noCheck", "--jsx", "react", "--target", "es2020", "--skipLibCheck", "_appsrc.tsx"], check=True)
app = open("_appsrc.js").read().replace("</script", "<\\/script")
html = open("index.html").read()
i0 = html.index("<script>/*APP*/") + len("<script>/*APP*/")
i1 = html.index("</script>\n<script>/*BOOT*/")
html = html[:i0] + "\n" + app + "\n" + html[i1:]
open("index.html", "w").write(html)
print("built: index.html updated (%d KB)" % (os.path.getsize("index.html") // 1024))
