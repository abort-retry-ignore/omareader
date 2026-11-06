// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseColor, readablePoles, rgbToHsl } from "../src/contrast.js";
import { DEFAULT_TINT, normalizeTint, pushLightness, scaleSaturation, tintPoles } from "../src/tint.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastOf(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Defaults keep today's behavior: full tint, styled controls and selection.
assert.deepEqual(normalizeTint(undefined), { background: 100, text: 100, contrast: 0, controls: true, selection: true, vivid: true });
assert.deepEqual(normalizeTint(null), { ...DEFAULT_TINT });
assert.deepEqual(normalizeTint({ text: 0, controls: false }), { background: 100, text: 0, contrast: 0, controls: false, selection: true, vivid: true });
assert.equal(normalizeTint({ contrast: 70 }).contrast, 70);
assert.equal(normalizeTint({ contrast: 400 }).contrast, 100);
assert.equal(normalizeTint({ contrast: "x" }).contrast, 0, "an unreadable contrast falls back to none");
assert.equal(normalizeTint({ vivid: false }).vivid, false);
assert.equal(normalizeTint({ vivid: 0 }).vivid, true, "only an explicit false turns vivid logos off");
// Unreadable values fall back to the default, and out-of-range values clamp.
assert.equal(normalizeTint({ background: "abc" }).background, 100);
assert.equal(normalizeTint({ background: null }).background, 100);
assert.equal(normalizeTint({ background: "" }).background, 100);
assert.equal(normalizeTint({ background: -20 }).background, 0);
assert.equal(normalizeTint({ background: 250 }).background, 100);
assert.equal(normalizeTint({ text: 33.6 }).text, 34);
assert.equal(normalizeTint({ controls: 0 }).controls, true, "only an explicit false turns controls off");
assert.equal(normalizeTint([]).background, 100);
console.log("tint settings normalize and clamp");

// 100% is the identical string, so stock output cannot change.
assert.equal(scaleSaturation("#a9b1d6", 100), "#a9b1d6");
assert.equal(scaleSaturation("not a color", 0), "not a color");

const lavender = "#a9b1d6";
const full = rgbToHsl(parseColor(lavender));
const none = scaleSaturation(lavender, 0);
const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(none.slice(i, i + 2), 16));
assert.ok(r === g && g === b, `0% is neutral gray: ${none}`);
assert.ok(Math.abs(rgbToHsl(none).l - full.l) < 0.01, "lightness is kept");
const half = rgbToHsl(scaleSaturation(lavender, 50));
assert.ok(Math.abs(half.s - full.s / 2) < 0.02, `50% halves saturation: ${half.s} vs ${full.s}`);
assert.ok(Math.abs(half.h - full.h) < 0.02, "hue is kept");
console.log("saturation scaling keeps hue and lightness");

// Real Omarchy palettes (colors.toml background / foreground).
const palettes = {
  "tokyo-night": ["#1a1b26", "#a9b1d6"],
  gruvbox: ["#282828", "#d4be98"],
  "catppuccin-latte": ["#eff1f5", "#4c4f69"],
  "rose-pine": ["#faf4ed", "#575279"],
};
for (const [name, [background, foreground]] of Object.entries(palettes)) {
  // The user's setting: tinted backgrounds, neutral text.
  const tinted = tintPoles({ background, foreground }, { background: 100, text: 0 });
  assert.equal(tinted.background, background, `${name}: background pole is untouched`);
  assert.notEqual(tinted.foreground, foreground);
  const poles = readablePoles(tinted.background, tinted.foreground);
  assert.equal(rgbToHsl(poles.foreground).s, 0, `${name}: text pole is neutral ${poles.foreground}`);
  assert.ok(contrastOf(poles.foreground, poles.background) >= 6.9, `${name}: ${poles.foreground} on ${poles.background}`);
  // Stock settings return the palette exactly as before.
  assert.deepEqual(tintPoles({ background, foreground }, undefined), { background, foreground });
  assert.deepEqual(
    readablePoles(...Object.values(tintPoles({ background, foreground }, DEFAULT_TINT))),
    readablePoles(background, foreground),
  );
}
console.log("tinted poles stay readable on real Omarchy palettes");

// Text contrast: the darkest (or lightest) text a theme can show.
const lightFg = "#575279"; // Rose Pine, on #faf4ed
const darkFg = "#a9b1d6"; // Tokyo Night, on #1a1b26
assert.equal(pushLightness(lightFg, "#faf4ed", 0), lightFg, "0 changes nothing");
assert.equal(pushLightness("not a color", "#faf4ed", 100), "not a color");
assert.equal(pushLightness(lightFg, "not a color", 100), lightFg);
const lightL = (amount) => rgbToHsl(parseColor(pushLightness(lightFg, "#faf4ed", amount))).l;
const darkL = (amount) => rgbToHsl(parseColor(pushLightness(darkFg, "#1a1b26", amount))).l;
// A light theme's text gets darker as the amount grows, and a dark theme's gets lighter.
assert.ok(lightL(0) > lightL(50) && lightL(50) > lightL(100), "light theme text darkens");
assert.ok(darkL(0) < darkL(50) && darkL(50) < darkL(100), "dark theme text lightens");
assert.ok(Math.abs(lightL(100) - 0.06) < 0.01, `light theme limit ${lightL(100)}`);
assert.ok(Math.abs(darkL(100) - 0.94) < 0.01, `dark theme limit ${darkL(100)}`);
// Hue is kept, so the tint survives.
assert.ok(Math.abs(rgbToHsl(parseColor(pushLightness(lightFg, "#faf4ed", 100))).h - rgbToHsl(parseColor(lightFg)).h) < 0.03, "hue kept");
// A foreground already past the limit is left alone.
assert.equal(pushLightness("#000000", "#ffffff", 100), "#000000");
assert.equal(pushLightness("#ffffff", "#000000", 100), "#ffffff");
// Contrast against the theme background rises with the amount, on every palette.
for (const [name, [background, foreground]] of Object.entries(palettes)) {
  let last = 0;
  for (const amount of [0, 25, 50, 75, 100]) {
    const poles = tintPoles({ background, foreground }, { contrast: amount });
    assert.equal(poles.background, background, `${name}: background untouched`);
    const ratio = contrastOf(poles.foreground, poles.background);
    assert.ok(ratio >= last - 0.001, `${name}: contrast ${ratio} at ${amount} fell below ${last}`);
    last = ratio;
  }
  assert.ok(last > contrastOf(foreground, background) + 1, `${name}: 100 is clearly higher than the theme foreground`);
}
// The case that was reported: Rose Pine text on a page that was already light.
const reported = tintPoles({ background: "#faf4ed", foreground: lightFg }, { text: 0, contrast: 100 });
assert.ok(contrastOf(reported.foreground, "#faf4ed") > 14, `near the page's own ~16:1, got ${contrastOf(reported.foreground, "#faf4ed")}`);
assert.equal(rgbToHsl(parseColor(reported.foreground)).s < 0.05, true, "and neutral with text tint 0");
console.log("text contrast moves the foreground pole toward black or white");

// Source wiring: content.js cannot run under node, so pin the contract.
const content = readFileSync(join(root, "src/content.js"), "utf8");
assert.match(content, /styleSystemControls:\s*tint\.controls/);
assert.match(content, /selectionColor:\s*tint\.selection \?/);
assert.match(content, /omareaderVividSvg:\s*tint\.vivid/);
assert.match(content, /\$\{tint\.text\}\\0\$\{tint\.contrast\}/, "the pole cache key includes contrast");
assert.match(content, /tintPoles\(\{ background, foreground \}, tint\)/);
assert.match(content, /JSON\.stringify\(\[palette, hasFix \? fix : null, tint\]\)/, "a tint change must change the apply key");

const background = readFileSync(join(root, "src/background.js"), "utf8");
const guard = background.indexOf("if (!fromExtensionPage(port.sender, EXTENSION_ORIGIN))");
const handler = background.indexOf('message.type === "setTint"');
assert.ok(guard > 0 && handler > guard, "only extension pages may change tint settings");
console.log("tint is wired through content and background");
