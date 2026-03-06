import type { BiliCredential, BrowserCredentialImporter as BrowserCredentialImporterContract } from "../types.js";
import { createChromeCookieQuery, type BrowserCookie } from "./chrome-cookie-reader.js";

type CookieQuery = () => Promise<BrowserCookie[]>;

export interface BrowserCredentialImporterOptions {
  queryCookies?: CookieQuery;
  now?: () => string;
}

function buildDefaultQuery(): CookieQuery {
  return createChromeCookieQuery();
}

function pickCookies(cookies: BrowserCookie[]) {
  const selected = new Map<string, BrowserCookie>();

  for (const cookie of cookies) {
    const current = selected.get(cookie.name);
    if (!current || String(cookie.value).length >= String(current.value).length) {
      selected.set(cookie.name, cookie);
    }
  }

  return selected;
}

export class BrowserCredentialImporter implements BrowserCredentialImporterContract {
  private readonly queryCookies: CookieQuery;
  private readonly now: () => string;

  constructor(options: BrowserCredentialImporterOptions = {}) {
    this.queryCookies = options.queryCookies ?? buildDefaultQuery();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async importCredential(): Promise<BiliCredential | null> {
    const cookies = pickCookies(await this.queryCookies());
    const sessdata = cookies.get("SESSDATA")?.value;
    if (!sessdata) {
      return null;
    }

    const detectedBrowser = cookies.get("SESSDATA")?.meta?.browser;
    const dedeUserId = cookies.get("DedeUserID")?.value;
    const credentialCookies = Object.fromEntries(
      Array.from(cookies.entries())
        .map(([name, cookie]) => [name, String(cookie.value)])
        .filter(([, value]) => value.length > 0),
    );

    return {
      uid: dedeUserId ? Number(dedeUserId) : undefined,
      browser: typeof detectedBrowser === "string" ? detectedBrowser : "Chrome",
      source: "browser",
      updatedAt: this.now(),
      cookies: credentialCookies,
    };
  }
}
