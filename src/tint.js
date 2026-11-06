// SPDX-License-Identifier: MIT
// How strongly the theme's hue reaches the page. Dark Reader pulls every
// near-neutral color toward the hue and saturation of two poles: the theme
// background and the theme foreground. Scaling a pole's saturation scales how
// far the page is tinted, and keeps the pole's lightness, so contrast holds.
import { hslToHex, parseColor, rgbToHsl } from "./contrast.js";

export const DEFAULT_TINT = Object.freeze({
  background: 100,
  text: 100,
  controls: true,
  selection: true,
});

function percent(value, fallback) {
  const number = Number(value);
  if (value === null || value === "" || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

// Anything unreadable falls back to the stock behavior, so a bad stored value
// can never leave a page unthemed.
export function normalizeTint(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    background: percent(source.background, DEFAULT_TINT.background),
    text: percent(source.text, DEFAULT_TINT.text),
    controls: source.controls !== false,
    selection: source.selection !== false,
  };
}

export function scaleSaturation(color, strength) {
  if (strength >= 100) {
    return color;
  }
  const hex = parseColor(color);
  if (!hex) {
    return color;
  }
  const hsl = rgbToHsl(hex);
  return hslToHex({ ...hsl, s: (hsl.s * strength) / 100 });
}

// Run this before readablePoles: removing saturation shifts luminance, and the
// contrast check has to see the colors the page will actually get.
export function tintPoles(poles, tint) {
  const strength = normalizeTint(tint);
  return {
    background: scaleSaturation(poles.background, strength.background),
    foreground: scaleSaturation(poles.foreground, strength.text),
  };
}
