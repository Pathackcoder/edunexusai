// Shared by the API and UI: browser and operating-system categories for portal analytics.
//
// The browser works these out from its own environment (navigator.userAgentData where the browser offers it, else
// the user-agent string) and sends only the category key. The user-agent string itself never leaves the browser and
// is never stored. Pure functions, so the rules are unit-tested.

export const BROWSERS = ['CHROME', 'SAFARI', 'EDGE', 'FIREFOX', 'OPERA', 'OTHER', 'UNKNOWN'];
export const BROWSER_LABELS = { CHROME: 'Chrome', SAFARI: 'Safari', EDGE: 'Edge', FIREFOX: 'Firefox', OPERA: 'Opera', OTHER: 'Other', UNKNOWN: 'Unknown' };
export const OPERATING_SYSTEMS = ['WINDOWS', 'MACOS', 'IOS', 'ANDROID', 'CHROMEOS', 'LINUX', 'OTHER', 'UNKNOWN'];
export const OS_LABELS = { WINDOWS: 'Windows', MACOS: 'macOS', IOS: 'iOS / iPadOS', ANDROID: 'Android', CHROMEOS: 'ChromeOS', LINUX: 'Linux', OTHER: 'Other', UNKNOWN: 'Unknown' };

/**
 * Browser category. `brands` is navigator.userAgentData.brands when available: Chromium-based browsers name
 * themselves there ("Google Chrome", "Microsoft Edge", "Opera", "Brave", "Samsung Internet"), which is more reliable
 * than the frozen user-agent string, so the brands decide first. Order matters in the string fallback: Edge, Opera
 * and other Chromium browsers also say "Chrome", and Chrome also says "Safari".
 */
export function classifyBrowser(userAgent, brands = null) {
  const names = Array.isArray(brands) ? brands.map((entry) => String(entry?.brand ?? '')).filter((name) => name && !/not.?a.?brand/i.test(name)) : [];
  if (names.some((name) => /Microsoft Edge/i.test(name))) return 'EDGE';
  if (names.some((name) => /\bOpera\b/i.test(name))) return 'OPERA';
  if (names.some((name) => /Brave|Samsung Internet|Yandex|Vivaldi|DuckDuckGo|Whale/i.test(name))) return 'OTHER';
  if (names.some((name) => /Google Chrome|HeadlessChrome/i.test(name))) return 'CHROME';
  const ua = String(userAgent ?? '');
  if (!ua.trim()) return names.some((name) => /Chromium/i.test(name)) ? 'CHROME' : 'UNKNOWN';
  if (/\b(Edg|EdgA|EdgiOS|Edge)\//.test(ua)) return 'EDGE';
  if (/\b(OPR|OPT|Opera|OPX)\//.test(ua) || /\bOpera\b/.test(ua)) return 'OPERA';
  if (/\b(FxiOS|Firefox)\//.test(ua)) return 'FIREFOX';
  // Other browsers built on Chromium or WebKit that announce themselves: not Chrome, not Safari.
  if (/\b(SamsungBrowser|YaBrowser|UCBrowser|Vivaldi|Brave|DuckDuckGo|Whale|MiuiBrowser|HuaweiBrowser)\//.test(ua)) return 'OTHER';
  // "HeadlessChrome/" (automated Chrome) has no word boundary before "Chrome", so it is named explicitly.
  if (/\b(CriOS|Chrome|Chromium|HeadlessChrome)\//.test(ua)) return 'CHROME';
  if (/\bVersion\/[\d.]+.*\bSafari\//.test(ua) || (/\b(iPhone|iPad|iPod|Macintosh)\b/.test(ua) && /AppleWebKit\//.test(ua))) return 'SAFARI';
  return 'OTHER';
}

/**
 * Operating-system category. `platform` is navigator.userAgentData.platform when available. iPadOS presents itself as
 * a Mac, so a "Macintosh" with a touch screen (`maxTouchPoints` > 1) is an iPad.
 */
export function classifyOs(userAgent, platform = null, maxTouchPoints = 0) {
  const hint = String(platform ?? '').trim().toLowerCase();
  if (hint === 'windows') return 'WINDOWS';
  if (hint === 'android') return 'ANDROID';
  if (hint === 'chrome os' || hint === 'chromeos') return 'CHROMEOS';
  if (hint === 'ios') return 'IOS';
  if (hint === 'macos' || hint === 'mac os' || hint === 'mac os x') return maxTouchPoints > 1 ? 'IOS' : 'MACOS';
  if (hint === 'linux') return 'LINUX';
  const ua = String(userAgent ?? '');
  if (!ua.trim()) return 'UNKNOWN';
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return 'IOS';
  if (/\bAndroid\b/.test(ua)) return 'ANDROID';
  if (/\bCrOS\b/.test(ua)) return 'CHROMEOS';
  if (/\bWindows\b/.test(ua)) return 'WINDOWS';
  if (/\bMacintosh\b|\bMac OS X\b/.test(ua)) return maxTouchPoints > 1 ? 'IOS' : 'MACOS';
  if (/\bLinux\b|\bX11\b/.test(ua)) return 'LINUX';
  return 'OTHER';
}
