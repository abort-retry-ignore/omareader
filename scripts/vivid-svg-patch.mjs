// SPDX-License-Identifier: MIT
//
// Keep logo colors vivid.
//
// For an inline SVG with a fill attribute, Dark Reader decides per shape whether the
// color is text or a background. A shape wider or taller than 32px counts as a
// background, and the background function squeezes light colors into a dark range
// (lightness is capped at 0.4). A 272x92 wordmark is all big shapes, so Google's logo
// comes out dim. Even as text, a dark theme lifts a darker color to at least 55%
// lightness, and a light theme pulls every color toward its background, so neither
// path gives back the brand color.
//
// This patch leaves a saturated fill in a logo-sized SVG exactly as authored:
//   - on a light theme, always, because the page was designed for a light background;
//   - on a dark theme, when it has at least 3:1 contrast with the theme background,
//     which is the WCAG minimum for graphics. A darker brand color falls back to
//     Dark Reader's text treatment, which lightens it, so it never disappears.
// Neutral fills (the white and gray shapes that really are backgrounds) and large SVGs
// keep the original treatment. The theme option omareaderVividSvg turns it on.
//
// darkreader is pinned to one exact version, so this patches that version's text.
// If a target is missing the build stops, instead of shipping an unpatched engine.

// Logo-sized: up to about 400 x 160. Larger SVGs are illustrations.
export const LOGO_MAX_AREA = 64000;
// Saturated, and not near-black or near-white. Near-neutral colors stay on the
// background path.
export const MIN_SATURATION = 0.35;
export const MIN_LIGHTNESS = 0.2;
export const MAX_LIGHTNESS = 0.8;
// Dark themes only: the lowest contrast with the theme background to keep a color.
export const MIN_CONTRAST = 3;

const HELPER = `const omareaderSvgArea = new WeakMap();
function omareaderLuminance({r, g, b}) {
    const channel = (value) => {
        const v = value / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
// Returns "keep" to leave the color as authored, "lift" to treat it as text, or ""
// to leave Dark Reader's own decision alone.
function omareaderVividSvgColor(theme, root, value) {
    if (!theme || !theme.omareaderVividSvg || !root) {
        return "";
    }
    const color = parseColorWithCache(value);
    if (!color || color.a < 1) {
        return "";
    }
    const {s, l} = rgbToHSL(color);
    if (s < ${MIN_SATURATION} || l < ${MIN_LIGHTNESS} || l > ${MAX_LIGHTNESS}) {
        return "";
    }
    let area = omareaderSvgArea.get(root);
    if (area === undefined) {
        const bounds = root.getBoundingClientRect();
        area = bounds.width * bounds.height;
        omareaderSvgArea.set(root, area);
    }
    if (!(area > 0 && area <= ${LOGO_MAX_AREA})) {
        return "";
    }
    if (theme.mode !== 1) {
        return "keep";
    }
    const page = parseColorWithCache(theme.darkSchemeBackgroundColor);
    if (!page) {
        return "lift";
    }
    const a = omareaderLuminance(color);
    const b = omareaderLuminance(page);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return ratio >= ${MIN_CONTRAST} ? "keep" : "lift";
}
`;

// Defined inside overrideInlineStyle(), next to unsetProps, which it updates. It does
// what setCustomProp()'s own setStaticValue() does, with the authored value.
const KEEP_FUNCTION = `
    function omareaderKeepInlineValue(targetCSSProp, value) {
        element.style.setProperty(overrides[targetCSSProp].customProp, value);
        if (!element.hasAttribute(overrides[targetCSSProp].dataAttr)) {
            element.setAttribute(overrides[targetCSSProp].dataAttr, "");
        }
        trackInlineStyleTeardown(element);
        unsetProps.delete(targetCSSProp);
    }`;
const UNSET_TARGET = "const unsetProps = new Set(Object.keys(overrides));";

const FILL_TARGET = /setCustomProp\(\s*"fill",\s*isBg \? "background-color" : "color",\s*value\s*\);/;
const FILL_REPLACEMENT = `const omareaderVivid = isBg ? omareaderVividSvgColor(theme, root, value) : "";
                        if (omareaderVivid === "keep") {
                            omareaderKeepInlineValue("fill", value);
                        } else {
                            setCustomProp(
                                "fill",
                                isBg && omareaderVivid !== "lift" ? "background-color" : "color",
                                value
                            );
                        }`;

const STOP_TARGET = /setCustomProp\(\s*"stop-color",\s*"background-color",\s*element\.getAttribute\("stop-color"\)\s*\);/;
const STOP_REPLACEMENT = `const omareaderStop = element.getAttribute("stop-color");
            const omareaderVividStop = omareaderVividSvgColor(theme, getSVGElementRoot(element), omareaderStop);
            if (omareaderVividStop === "keep") {
                omareaderKeepInlineValue("stop-color", omareaderStop);
            } else {
                setCustomProp(
                    "stop-color",
                    omareaderVividStop === "lift" ? "color" : "background-color",
                    omareaderStop
                );
            }`;

const FUNCTION_TARGET = "function overrideInlineStyle(";

function count(source, needle) {
  if (needle instanceof RegExp) {
    return (source.match(new RegExp(needle.source, "g")) || []).length;
  }
  return source.split(needle).length - 1;
}

function requireOne(source, needle, what) {
  const found = count(source, needle);
  if (found !== 1) {
    throw new Error(
      `Dark Reader ${what} was found ${found} times, expected once. ` +
        "Update scripts/vivid-svg-patch.mjs for this Dark Reader version.",
    );
  }
}

export function patchVividSvg(source) {
  requireOne(source, FILL_TARGET, "inline SVG fill classification");
  requireOne(source, STOP_TARGET, "inline SVG stop-color handling");
  requireOne(source, UNSET_TARGET, "unsetProps declaration");
  requireOne(source, FUNCTION_TARGET, "overrideInlineStyle()");
  let next = source.replace(FILL_TARGET, () => FILL_REPLACEMENT);
  next = next.replace(STOP_TARGET, () => STOP_REPLACEMENT);
  next = next.replace(UNSET_TARGET, () => `${UNSET_TARGET}${KEEP_FUNCTION}`);
  next = next.replace(FUNCTION_TARGET, () => `${HELPER}${FUNCTION_TARGET}`);
  return next;
}
