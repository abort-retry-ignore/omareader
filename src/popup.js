// SPDX-License-Identifier: MIT
import { updateLine } from "./update-notice.js";

const enabledButton = document.querySelector("#enabled");
const enabledCtrl = document.querySelector("#enabled-ctrl");
const enabledLabel = document.querySelector("#enabled-label");
const siteLine = document.querySelector("#site-line");
const siteHost = document.querySelector("#site-host");
const siteCtrl = document.querySelector("#site-ctrl");
const siteButton = document.querySelector("#site");
const siteLabel = document.querySelector("#site-label");
const siteIcon = document.querySelector("#site-icon");
const themeNode = document.querySelector("#theme");
const statusNode = document.querySelector("#status");
const swatches = document.querySelector(".swatches");
const bg = document.querySelector("#bg");
const fg = document.querySelector("#fg");
const bgLabel = document.querySelector("#bg-label");
const fgLabel = document.querySelector("#fg-label");
const darkReader = document.querySelector("#dark-reader");
const siteFixesInput = document.querySelector("#site-fixes");
const tintBackground = document.querySelector("#tint-background");
const tintBackgroundOut = document.querySelector("#tint-background-out");
const tintText = document.querySelector("#tint-text");
const tintTextOut = document.querySelector("#tint-text-out");
const tintContrast = document.querySelector("#tint-contrast");
const tintContrastOut = document.querySelector("#tint-contrast-out");
const tintControls = document.querySelector("#tint-controls");
const tintSelection = document.querySelector("#tint-selection");
const tintVivid = document.querySelector("#tint-vivid");
const updateInstalled = document.querySelector("#update-installed");
const updateAvailable = document.querySelector("#update-available");
const darkReaderText = document.querySelector("#dark-reader-text");
const DARK_READER_KNOWN = "Dark Reader is also on. Both extensions restyle the page. Turn Dark Reader off?";
const DARK_READER_UNKNOWN = "If Dark Reader is also on, both restyle pages. Turn it off?";
let declineNote = "";
let latest = null;
let host = "";

function syncDetails() {
  siteLine.hidden = !host;
}

function renderControls() {
  const enabled = latest?.enabled !== false;
  const paused = Boolean(host && latest?.pausedSites?.includes(host));
  enabledLabel.textContent = enabled ? "turn off everywhere" : "turn on everywhere";
  enabledCtrl.classList.toggle("muted", !enabled);
  siteCtrl.hidden = !host;
  siteCtrl.classList.toggle("muted", Boolean(host) && (!enabled || paused));
  if (host) {
    siteHost.textContent = host;
    const theming = enabled && !paused;
    siteLabel.textContent = enabled && paused ? "theme this site" : "pause on this site";
    siteIcon.classList.toggle("pause", theming || !enabled);
    siteIcon.classList.toggle("play", enabled && paused);
  }
  syncDetails();
}

function applyPalette(palette) {
  const root = document.documentElement;
  if (!palette?.background || !palette?.foreground) {
    themeNode.textContent = "Waiting for Omarchy";
    swatches.hidden = true;
    root.style.removeProperty("--popup-bg");
    root.style.removeProperty("--popup-fg");
    root.style.colorScheme = "";
    return;
  }
  const name = palette.theme || "current theme";
  themeNode.textContent = `${name} · ${palette.mode}`;
  swatches.hidden = false;
  bg.style.background = palette.background;
  fg.style.background = palette.foreground;
  bgLabel.textContent = palette.background;
  fgLabel.textContent = palette.foreground;
  root.style.setProperty("--popup-bg", palette.background);
  root.style.setProperty("--popup-fg", palette.foreground);
  root.style.colorScheme = palette.mode === "light" ? "light" : "dark";
}

function render(state) {
  if (!state) {
    return;
  }
  latest = state;
  renderControls();
  applyPalette(state.palette);
  const note = state.hostError || declineNote;
  statusNode.textContent = note;
  statusNode.hidden = note === "";
  darkReader.hidden = !state.darkReaderPrompt;
  siteFixesInput.checked = state.siteFixesAutoUpdate !== false;
  renderTint(state.tint);
  applyUpdate(state.updateVersion, state.updateChecked);
  if (state.darkReaderPrompt) {
    darkReaderText.textContent = state.darkReaderKnown ? DARK_READER_KNOWN : DARK_READER_UNKNOWN;
  }
  syncDetails();
}

function renderTint(tint) {
  if (!tint) {
    return;
  }
  tintBackground.value = tint.background;
  tintBackgroundOut.textContent = `${tint.background}%`;
  tintText.value = tint.text;
  tintTextOut.textContent = `${tint.text}%`;
  tintContrast.value = tint.contrast ?? 0;
  tintContrastOut.textContent = `${tint.contrast ?? 0}%`;
  tintControls.checked = tint.controls !== false;
  tintSelection.checked = tint.selection !== false;
  tintVivid.checked = tint.vivid !== false;
}

// A change repaints every open tab, so a slider sends once it is released.
function sendTint(change) {
  if (latest) {
    latest.tint = { ...latest.tint, ...change };
  }
  port.postMessage({ type: "setTint", tint: change });
}

function applyUpdate(available, checked) {
  const line = updateLine(chrome.runtime.getManifest().version, available, checked);
  updateInstalled.textContent = line.installed;
  updateAvailable.hidden = line.available === "";
  updateAvailable.textContent = line.available;
  if (line.href) {
    updateAvailable.href = line.href;
  } else {
    updateAvailable.removeAttribute("href");
  }
}

applyUpdate("", false);

const port = chrome.runtime.connect({ name: "client" });
port.onMessage.addListener(render);
enabledButton.addEventListener("click", () => {
  const enabled = latest?.enabled === false;
  if (latest) {
    latest.enabled = enabled;
  }
  renderControls();
  port.postMessage({ type: "setEnabled", enabled });
});
siteButton.addEventListener("click", () => {
  if (!host) {
    return;
  }
  const paused = Boolean(latest?.pausedSites?.includes(host));
  if (latest) {
    const next = new Set(latest.pausedSites || []);
    if (paused) {
      next.delete(host);
    } else {
      next.add(host);
    }
    latest.pausedSites = [...next];
  }
  renderControls();
  port.postMessage({ type: "setSitePaused", host, paused: !paused });
});
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    host = new URL(tabs?.[0]?.url || "").hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    host = "";
  }
  renderControls();
});
document.querySelector("#dark-reader-off").addEventListener("click", async () => {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ permissions: ["management"] });
  } catch {
    // Leave granted false and tell the user how to turn Dark Reader off.
  }
  if (!granted) {
    declineNote = "Turn Dark Reader off in chrome://extensions.";
  }
  port.postMessage({ type: "darkReaderChoice", disable: granted });
});
document.querySelector("#dark-reader-keep").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: false });
});
tintBackground.addEventListener("input", () => {
  tintBackgroundOut.textContent = `${tintBackground.value}%`;
});
tintBackground.addEventListener("change", () => {
  sendTint({ background: Number(tintBackground.value) });
});
tintText.addEventListener("input", () => {
  tintTextOut.textContent = `${tintText.value}%`;
});
tintText.addEventListener("change", () => {
  sendTint({ text: Number(tintText.value) });
});
tintContrast.addEventListener("input", () => {
  tintContrastOut.textContent = `${tintContrast.value}%`;
});
tintContrast.addEventListener("change", () => {
  sendTint({ contrast: Number(tintContrast.value) });
});
tintControls.addEventListener("change", () => {
  sendTint({ controls: tintControls.checked });
});
tintSelection.addEventListener("change", () => {
  sendTint({ selection: tintSelection.checked });
});
tintVivid.addEventListener("change", () => {
  sendTint({ vivid: tintVivid.checked });
});
siteFixesInput.addEventListener("change", () => {
  port.postMessage({ type: "setSiteFixesAutoUpdate", enabled: siteFixesInput.checked });
});
