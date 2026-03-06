const COOKIE_NAMES = ["SESSDATA", "bili_jct", "DedeUserID", "ac_time_value", "buvid3", "buvid4", "_uuid", "b_nut"];
const BILIBILI_URLS = [
  "https://www.bilibili.com/",
  "https://passport.bilibili.com/",
  "https://space.bilibili.com/",
  "https://t.bilibili.com/",
];

type ChromeCookiesSecureModule = {
  getCookiesPromised(uri: string, format: "object", profileOrPath?: string): Promise<Record<string, unknown>>;
};

export type BrowserCookie = {
  name: string;
  value: string | number;
  domain?: string;
  meta?: {
    browser?: string;
  };
};

export interface ChromeCookieQueryOptions {
  loadChromeCookiesSecure?: () => Promise<ChromeCookiesSecureModule>;
}

async function loadChromeCookiesSecureModule(): Promise<ChromeCookiesSecureModule> {
  const chromeCookiesSecure = await import("chrome-cookies-secure");
  return chromeCookiesSecure.default ?? chromeCookiesSecure;
}

export function createChromeCookieQuery(options: ChromeCookieQueryOptions = {}) {
  const loadChromeCookiesSecure = options.loadChromeCookiesSecure ?? loadChromeCookiesSecureModule;

  return async (): Promise<BrowserCookie[]> => {
    try {
      const chromeCookiesSecure = await loadChromeCookiesSecure();
      const cookieGroups = await Promise.all(
        BILIBILI_URLS.map(async (url) => {
          try {
            return await chromeCookiesSecure.getCookiesPromised(url, "object");
          } catch {
            return {};
          }
        }),
      );
      const cookies = Object.assign({}, ...cookieGroups);

      return COOKIE_NAMES.flatMap((name) => {
        const value = cookies[name];
        if (typeof value !== "string" || value.length === 0) {
          return [];
        }

        return [{
          name,
          value,
          domain: ".bilibili.com",
          meta: { browser: "Chrome" },
        } satisfies BrowserCookie];
      });
    } catch {
      return [];
    }
  };
}
