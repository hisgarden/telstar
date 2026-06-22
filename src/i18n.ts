/**
 * Minimal, dependency-free UI i18n. `t(key, params)` returns the message for the
 * current `locale` signal, falling back to English then to the key itself.
 * Because `t` reads the locale signal, any SignalWatcher component that calls it
 * in render() re-renders when the locale changes. Placeholders are `{name}`.
 *
 * Channel data (names, languages) is never translated — only UI chrome.
 */
import { locale } from "./state/signals";
import { EXTRA_MESSAGES } from "./i18n-locales";

/** A BCP-47 UI locale. Any locale works — untranslated chrome falls back to en. */
export type Locale = string;

export type Direction = "ltr" | "rtl";

/** Right-to-left UI locales. */
const RTL_LOCALES = new Set(["ar", "fa", "ur"]);

/**
 * Supported UI locales (BCP-47) — one per channel language, so the app is truly
 * global. Only en / zh-Hans / zh-Hant have translated chrome below; the rest
 * fall back to English chrome (with native language names via Intl.DisplayNames).
 */
const UI_LOCALE_CODES = [
  "en", "zh-Hans", "zh-Hant", "es", "ar", "hi", "fr", "pt", "ru", "ja", "ko",
  "de", "it", "vi", "th", "tr", "fa", "ur", "bn", "ta", "pa", "id", "nl", "pl", "uk",
];

/** A locale's endonym (its language name in its own script), via Intl.DisplayNames. */
function localeLabel(code: string): string {
  const arg = code === "zh-Hans" || code === "zh-Hant" ? code : code.split("-")[0];
  try {
    const n = new Intl.DisplayNames([code], { type: "language" }).of(arg);
    if (n) return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  } catch {
    /* Intl data unavailable for this locale */
  }
  return code;
}

/** Selectable UI languages (native label; `dir` for RTL). Generated from Intl. */
export const LOCALES: { code: Locale; label: string; dir: Direction }[] = UI_LOCALE_CODES.map(
  (code) => ({
    code,
    label: localeLabel(code),
    dir: RTL_LOCALES.has(code.split("-")[0]) ? "rtl" : "ltr",
  }),
);

/** Text direction for a locale (defaults to ltr). Ready for RTL locales (e.g. Arabic). */
export function localeDir(code: string): Direction {
  return LOCALES.find((l) => l.code === code)?.dir ?? "ltr";
}

/** Apply a locale's text direction to the document so the whole UI flips for RTL. */
export function applyLocaleDir(code: string): void {
  try {
    document.documentElement.dir = localeDir(code);
  } catch {
    /* no document (non-DOM context) */
  }
}

type Dict = Record<string, string>;

const en: Dict = {
  tagline: "A free, open-source global TV explorer",
  openFile: "Open file…",
  urlPlaceholder: "…or paste a playlist URL",
  loadUrl: "Load URL",
  browserHint:
    "Loading playlists needs the desktop app — run {cmd}. The browser preview can't reach the native file picker or fetch.",
  loaded: "Loaded {count} channels",
  skipped: " ({count} skipped)",
  noPlayable: "No playable channels found in that playlist.",
  loadError: "Could not load playlist: {error}",
  selectChannel: "Select channel",
  allLanguages: "All languages",
  allCountries: "All countries",
  search: "Search channels…",
  noChannels: "No channels loaded — open a playlist file or load a URL.",
  found: "{count} found",
  ofTotal: "{count} of {total}",
  hiddenByFilters: "{count} channels loaded, but the current filters hide them all.",
  clearFilters: "Clear filters",
  noMatch: "No channel matches “{query}”.",
  hideChannelTitle: "Hide this channel",
  recent: "Recent",
  removeFromRecent: "Remove from Recent",
  hideChannel: "Hide channel",
  uiLanguage: "Interface language",
  rescan: "Re-scan availability",
  localTime: "Local time",
  settings: "Settings",
  loadCustom: "Load a custom playlist",
  loadCustomHint: "Open a local .m3u file or paste a playlist URL.",
  close: "Close",
  maximize: "Maximize",
  exitMaximize: "Exit",
  iCloudSync: "iCloud sync",
  iCloudSyncLabel: "Sync with iCloud",
  iCloudSyncHint:
    "Keeps your favorites, hidden channels, recents, and preferences in step across your Apple devices. Syncs only to your own private iCloud — never to Telstar or any third party.",
  fundingPublic: "Publicly funded broadcaster ({country})",
  fundingState: "Funded in whole or in part by the government of {country}",
};

const zhHans: Dict = {
  tagline: "免费、开源的全球电视浏览器",
  openFile: "打开文件…",
  urlPlaceholder: "…或粘贴播放列表网址",
  loadUrl: "加载网址",
  browserHint: "加载播放列表需要桌面应用 — 运行 {cmd}。浏览器预览无法访问本机文件选择器或网络请求。",
  loaded: "已加载 {count} 个频道",
  skipped: "（跳过 {count} 个）",
  noPlayable: "该播放列表中未找到可播放的频道。",
  loadError: "无法加载播放列表：{error}",
  selectChannel: "选择频道",
  allLanguages: "所有语言",
  allCountries: "所有国家/地区",
  search: "搜索频道…",
  noChannels: "未加载频道 — 打开播放列表文件或加载网址。",
  found: "找到 {count} 个",
  ofTotal: "{count} / {total}",
  hiddenByFilters: "已加载 {count} 个频道，但当前筛选条件将其全部隐藏。",
  clearFilters: "清除筛选",
  noMatch: "没有匹配“{query}”的频道。",
  hideChannelTitle: "隐藏此频道",
  recent: "最近",
  removeFromRecent: "从最近移除",
  hideChannel: "隐藏频道",
  uiLanguage: "界面语言",
  rescan: "重新扫描可用性",
  localTime: "本地时间",
  settings: "设置",
  loadCustom: "加载自定义播放列表",
  loadCustomHint: "打开本地 .m3u 文件或粘贴播放列表网址。",
  close: "关闭",
  maximize: "最大化",
  exitMaximize: "退出",
  iCloudSync: "iCloud 同步",
  iCloudSyncLabel: "使用 iCloud 同步",
  iCloudSyncHint:
    "在你的各台 Apple 设备之间同步收藏、隐藏频道、最近观看和偏好设置。只会同步到你自己的私人 iCloud — 绝不会上传到 Telstar 或任何第三方。",
  fundingPublic: "公共资助的广播机构（{country}）",
  fundingState: "全部或部分由{country}政府出资",
};

const zhHant: Dict = {
  tagline: "免費、開源的全球電視瀏覽器",
  openFile: "開啟檔案…",
  urlPlaceholder: "…或貼上播放清單網址",
  loadUrl: "載入網址",
  browserHint: "載入播放清單需要桌面應用程式 — 執行 {cmd}。瀏覽器預覽無法存取本機檔案選擇器或網路請求。",
  loaded: "已載入 {count} 個頻道",
  skipped: "（略過 {count} 個）",
  noPlayable: "此播放清單中找不到可播放的頻道。",
  loadError: "無法載入播放清單：{error}",
  selectChannel: "選擇頻道",
  allLanguages: "所有語言",
  allCountries: "所有國家/地區",
  search: "搜尋頻道…",
  noChannels: "尚未載入頻道 — 開啟播放清單檔案或載入網址。",
  found: "找到 {count} 個",
  ofTotal: "{count} / {total}",
  hiddenByFilters: "已載入 {count} 個頻道，但目前的篩選條件將其全部隱藏。",
  clearFilters: "清除篩選",
  noMatch: "找不到符合「{query}」的頻道。",
  hideChannelTitle: "隱藏此頻道",
  recent: "最近",
  removeFromRecent: "從最近移除",
  hideChannel: "隱藏頻道",
  uiLanguage: "介面語言",
  rescan: "重新掃描可用性",
  localTime: "本地時間",
  settings: "設定",
  loadCustom: "載入自訂播放清單",
  loadCustomHint: "開啟本機 .m3u 檔案或貼上播放清單網址。",
  close: "關閉",
  maximize: "最大化",
  exitMaximize: "離開",
  iCloudSync: "iCloud 同步",
  iCloudSyncLabel: "使用 iCloud 同步",
  iCloudSyncHint:
    "在你的各台 Apple 裝置之間同步收藏、隱藏頻道、最近觀看與偏好設定。只會同步到你自己的私人 iCloud — 絕不會上傳到 Telstar 或任何第三方。",
  fundingPublic: "公共資助的廣播機構（{country}）",
  fundingState: "全部或部分由{country}政府出資",
};

const MESSAGES: Record<string, Dict> = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ...EXTRA_MESSAGES,
};

/** Translate a key for the current locale, interpolating {placeholders}. */
export function t(key: string, params?: Record<string, string | number>): string {
  const loc = locale.get();
  let s = MESSAGES[loc]?.[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
