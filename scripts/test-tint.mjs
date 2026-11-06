// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseColor, readablePoles, rgbToHsl } from "../src/contrast.js";
import { DEFAULT_TINT, normalizeTint, scaleSaturation, tintPoles } from "../src/tint.js";

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
assert.deepEqual(normalizeTint(undefined), { background: 100, text: 100, controls: true, selection: true });
assert.deepEqual(normalizeTint(null), { ...DEFAULT_TINT });
assert.deepEqual(normalizeTint({ text: 0, controls: false }), { background: 100, text: 0, controls: false, selection: true });
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

// Source wiring: content.js cannot run under node, so pin the contract.
const content = readFileSync(join(root, "src/content.js"), "utf8");
assert.match(content, /styleSystemControls:\s*tint\.controls/);
assert.match(content, /selectionColor:\s*tint\.selection \?/);
assert.match(content, /tintPoles\(\{ background, foreground \}, tint\)/);
assert.match(content, /JSON\.stringify\(\[palette, hasFix \? fix : null, tint\]\)/, "a tint change must change the apply key");

const background = readFileSync(join(root, "src/background.js"), "utf8");
const guard = background.indexOf("if (!fromExtensionPage(port.sender, EXTENSION_ORIGIN))");
const handler = background.indexOf('message.type === "setTint"');
assert.ok(guard > 0 && handler > guard, "only extension pages may change tint settings");
console.log("tint is wired through content and background");
