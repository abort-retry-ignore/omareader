// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseColor, rgbToHsl } from "../src/contrast.js";
import { patchVividSvg } from "./vivid-svg-patch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const darkReader = readFileSync(join(root, "node_modules/darkreader/darkreader.mjs"), "utf8");
const patched = patchVividSvg(darkReader);

// The real pinned bundle takes the patch, and the original decisions are gone.
assert.equal(darkReader.includes("omareader"), false, "the pristine bundle has no patch");
assert.equal(patched.includes('isBg ? "background-color" : "color",\n'), false);
assert.match(patched, /omareaderVividSvgColor\(theme, root, value\)/);
assert.match(patched, /omareaderKeepInlineValue\("fill", value\)/);
assert.match(patched, /omareaderVividSvgColor\(theme, getSVGElementRoot\(element\), omareaderStop\)/);
assert.match(patched, /omareaderKeepInlineValue\("stop-color", omareaderStop\)/);
const defined = (name) => patched.indexOf(`function ${name}(`);
assert.ok(defined("omareaderVividSvgColor") > 0 && defined("omareaderVividSvgColor") < defined("overrideInlineStyle"));
// The keep function lives inside overrideInlineStyle(), after unsetProps, which it updates.
assert.ok(defined("omareaderKeepInlineValue") > defined("overrideInlineStyle"));
assert.ok(patched.indexOf("const unsetProps") < defined("omareaderKeepInlineValue"));
assert.equal(patched.split("function overrideInlineStyle(").length - 1, 1);
assert.doesNotThrow(() => new Function(patched.replace(/^export\s*\{[^}]*\};?\s*$/m, "")), "the patched bundle still parses");
console.log("patch applies to the pinned Dark Reader bundle");

// A Dark Reader update that moves the code stops the build instead of skipping the patch.
assert.throws(() => patchVividSvg("nothing here"), /inline SVG fill classification was found 0 times/);
assert.throws(
  () => patchVividSvg(`${darkReader}\nsetCustomProp("fill", isBg ? "background-color" : "color", value);`),
  /fill classification was found 2 times/,
);
const drifted = darkReader.replace(/"stop-color",\s*"background-color"/, '"stop-color", "bg"');
assert.notEqual(drifted, darkReader, "the drifted copy really differs");
assert.throws(() => patchVividSvg(drifted), /stop-color handling was found 0 times/);
const noUnset = darkReader.replace("const unsetProps = new Set(Object.keys(overrides));", "const other = 1;");
assert.notEqual(noUnset, darkReader);
assert.throws(() => patchVividSvg(noUnset), /unsetProps declaration was found 0 times/);
console.log("a drifted Dark Reader fails the build");

// Run the injected helper with stand-ins for the engine's color parser.
const start = patched.indexOf("const omareaderSvgArea");
const end = patched.indexOf("function overrideInlineStyle(");
const makeHelper = new Function(
  "parseColorWithCache",
  "rgbToHSL",
  `${patched.slice(start, end)}\nreturn omareaderVividSvgColor;`,
);
function parse(value) {
  const hex = parseColor(value);
  if (!hex) {
    return null;
  }
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return { r, g, b, a: 1, hex };
}
const vivid = makeHelper(parse, (color) => rgbToHsl(color.hex));
const svg = (width, height) => ({ getBoundingClientRect: () => ({ width, height }) });
const dark = { omareaderVividSvg: true, mode: 1, darkSchemeBackgroundColor: "#1a1b26" };
const light = { omareaderVividSvg: true, mode: 0, lightSchemeBackgroundColor: "#eff1f5" };
const logo = svg(272, 92);

// Google's wordmark on a dark theme: every color has enough contrast, so it stays as authored.
for (const color of ["#4285f4", "#ea4335", "#fbbc05", "#34a853", "#00af57"]) {
  assert.equal(vivid(dark, logo, color), "keep", `${color} on a dark theme`);
}
// On a light theme the page was designed for a light background, so it is always kept.
for (const color of ["#4285f4", "#ea4335", "#fbbc05", "#34a853"]) {
  assert.equal(vivid(light, logo, color), "keep", `${color} on a light theme`);
}
// A saturated color that would sink into a dark page falls back to the lightened text treatment.
assert.equal(vivid(dark, logo, "#3b4cb8"), "lift", "mid navy on a dark page");
// #4150c0 has 2.6:1 against the theme background and 3.1:1 against black.
assert.equal(vivid(dark, logo, "#4150c0"), "lift", "2.6:1 is below the line");
assert.equal(vivid({ ...dark, darkSchemeBackgroundColor: "#000000" }, logo, "#4150c0"), "keep", "3.1:1 is above it");
assert.equal(vivid({ ...dark, darkSchemeBackgroundColor: "not a color" }, logo, "#4285f4"), "lift", "unreadable page color");
// Off by setting, or when the option is absent.
assert.equal(vivid({ ...dark, omareaderVividSvg: false }, logo, "#4285f4"), "");
assert.equal(vivid({ mode: 1 }, logo, "#4285f4"), "");
assert.equal(vivid(null, logo, "#4285f4"), "");
// Large SVGs are illustrations, so they keep the background treatment.
assert.equal(vivid(dark, svg(1200, 600), "#4285f4"), "", "large illustration");
assert.equal(vivid(dark, svg(400, 160), "#4285f4"), "keep", "edge of logo size");
assert.equal(vivid(dark, svg(400, 161), "#4285f4"), "", "just over");
// Neutral and extreme colors are real backgrounds or near-black ink.
for (const color of ["#ffffff", "#808080", "#f1f3f4", "#101040", "#fff5d6"]) {
  assert.equal(vivid(dark, logo, color), "", color);
  assert.equal(vivid(light, logo, color), "", color);
}
// Things that are not a color, or an SVG that has no size yet.
assert.equal(vivid(dark, logo, "url(#gradient)"), "");
assert.equal(vivid(dark, logo, "none"), "");
assert.equal(vivid(dark, svg(0, 0), "#4285f4"), "", "not laid out");
assert.equal(vivid(dark, null, "#4285f4"), "", "no root");
console.log("vivid helper keeps logo colors and leaves backgrounds alone");
