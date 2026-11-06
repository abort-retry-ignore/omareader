// SPDX-License-Identifier: MIT
// How strongly the theme's hue reaches the page. Dark Reader pulls every
// near-neutral color toward the hue and saturation of two poles: the theme
// background and the theme foreground. Scaling a pole's saturation scales how
// far the page is tinted, and keeps the pole's lightness, so contrast holds.
import { hslToHex, parseColor, rgbToHsl } from "./contrast.js";

export const DEFAULT_TINT = Object.freeze({
  background: 100,
  text: 100,
  // 0 keeps the lightness of the theme foreground. 100 pushes text to near-black on a
  // light theme and near-white on a dark one. See pushLightness().
  contrast: 0,
  controls: true,
  selection: true,
  // Saturated colors in logo-sized inline SVGs keep their color, see scripts/vivid-svg-patch.mjs.
  vivid: true,
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
    contrast: percent(source.contrast, DEFAULT_TINT.contrast),
    controls: source.controls !== false,
    selection: source.selection !== false,
    vivid: source.vivid !== false,
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

// Dark Reader maps every color's lightness into the band between the foreground pole
// and the background pole. The darkest text a light theme can show is therefore the
// theme foreground itself, and a mid-tone foreground washes a site out even when the
// site was already readable. This moves the foreground pole toward black on a light
// theme and white on a dark one, so a page's own text lightness comes through. Hue and
// saturation are kept. It stops short of pure black or white so the tint stays visible.
const DARKEST_TEXT = 0.06;
const LIGHTEST_TEXT = 0.94;

export function pushLightness(color, background, amount) {
  if (!(amount > 0)) {
    return color;
  }
  const foreground = parseColor(color);
  const page = parseColor(background);
  if (!foreground || !page) {
    return color;
  }
  const hsl = rgbToHsl(foreground);
  const darkText = hsl.l < rgbToHsl(page).l;
  const target = darkText ? DARKEST_TEXT : LIGHTEST_TEXT;
  // A foreground already past the limit stays where it is.
  if (darkText ? hsl.l <= target : hsl.l >= target) {
    return color;
  }
  return hslToHex({ ...hsl, l: hsl.l + ((target - hsl.l) * amount) / 100 });
}

// Run this before readablePoles: removing saturation shifts luminance, and the
// contrast check has to see the colors the page will actually get.
export function tintPoles(poles, tint) {
  const strength = normalizeTint(tint);
  const foreground = scaleSaturation(poles.foreground, strength.text);
  return {
    background: scaleSaturation(poles.background, strength.background),
    foreground: pushLightness(foreground, poles.background, strength.contrast),
  };
}
