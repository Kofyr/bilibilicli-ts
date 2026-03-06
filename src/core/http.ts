import { randomUUID } from "node:crypto";

import { AuthenticationError, BiliApiError } from "./errors.js";
import type { BiliCredential, HttpAdapter, RequestOptions } from "./types.js";
import { extractWbiKeys, signWbiQuery } from "./utils/wbi.js";

const API_ORIGIN = "https://api.bilibili.com";
const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.bilibili.com",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

type FetchLike = typeof fetch;

export interface BiliHttpClientOptions {
  fetchImpl?: FetchLike;
  randomId?: () => string;
  now?: () => number;
}

function mergeCookies(baseCookies: Record<string, string>, credential?: BiliCredential | null) {
  return {
    ...baseCookies,
    ...(credential?.cookies ?? {}),
  };
}

function toCookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function createUrl(pathOrUrl: string, params?: Record<string, unknown>) {
  const url = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(pathOrUrl, API_ORIGIN);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url;
}

function buildHeaders(
  anonymousCookies: Record<string, string>,
  credential: BiliCredential | null | undefined,
  options: RequestOptions,
) {
  const cookieHeader = toCookieHeader(mergeCookies(anonymousCookies, credential));
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Referer: options.referer ?? "https://www.bilibili.com/",
    ...(options.headers ?? {}),
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return headers;
}

export class BiliHttpClient implements HttpAdapter {
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly anonymousCookies: Record<string, string>;

  constructor(options: BiliHttpClientOptions = {}) {
    const randomId = options.randomId ?? randomUUID;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    const unix = Math.floor(this.now() / 1000).toString();
    const uuid = randomId();
    this.anonymousCookies = {
      buvid3: `${uuid}infoc`,
      b_nut: unix,
      _uuid: `${uuid}${unix}infoc`,
    };
  }

  async getJson(pathOrUrl: string, params?: Record<string, unknown>, options: RequestOptions = {}) {
    const url = createUrl(pathOrUrl, params);
    return this.performRequest(url, options);
  }

  async getText(pathOrUrl: string, options: RequestOptions = {}) {
    const url = createUrl(pathOrUrl);
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: buildHeaders(this.anonymousCookies, options.credential, options),
    });

    if (!response.ok) {
      throw new BiliApiError(`请求失败: ${response.status} ${response.statusText}`, { status: response.status });
    }

    return response.text();
  }

  async getSignedJson(path: string, params: Record<string, unknown> = {}, options: RequestOptions = {}) {
    const nav = await this.getJson("/x/web-interface/nav", undefined, options);
    const query = signWbiQuery(params as Record<string, string | number | boolean | undefined>, extractWbiKeys(nav));
    const url = createUrl(path);
    url.search = query;
    return this.performRequest(url, options);
  }

  private async performRequest(url: URL, options: RequestOptions) {
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: buildHeaders(this.anonymousCookies, options.credential, options),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new BiliApiError(`请求失败: ${response.status} ${response.statusText}`, { status: response.status });
    }

    if (payload && typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
      if (payload.code === 0) {
        return "data" in payload ? payload.data : payload;
      }

      if (url.pathname === "/x/web-interface/nav" && "data" in payload && payload.data) {
        return payload.data;
      }

      if (payload.code === -101 || payload.code === -111) {
        throw new AuthenticationError(payload.message || "账号未登录");
      }

      throw new BiliApiError(payload.message || "Bilibili API 请求失败", {
        status: response.status,
        responseCode: payload.code,
      });
    }

    return payload;
  }
}
