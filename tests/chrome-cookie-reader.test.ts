import { describe, expect, it, vi } from "vitest";

import { createChromeCookieQuery } from "../src/core/auth/chrome-cookie-reader.js";

describe("createChromeCookieQuery", () => {
  it("maps chrome-cookies-secure output into browser cookies", async () => {
    const getCookiesPromised = vi.fn().mockResolvedValue({
      SESSDATA: "sess",
      bili_jct: "csrf",
      DedeUserID: "123",
      ignored: "",
    });

    const query = createChromeCookieQuery({
      loadChromeCookiesSecure: async () => ({ getCookiesPromised }),
    });

    await expect(query()).resolves.toEqual([
      { name: "SESSDATA", value: "sess", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "bili_jct", value: "csrf", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "DedeUserID", value: "123", domain: ".bilibili.com", meta: { browser: "Chrome" } },
    ]);

    expect(getCookiesPromised).toHaveBeenCalledWith("https://www.bilibili.com/", "object");
  });

  it("queries multiple bilibili subdomains for browser cookie extraction", async () => {
    const getCookiesPromised = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://www.bilibili.com/") {
        return { SESSDATA: "sess", bili_jct: "csrf", DedeUserID: "123" };
      }

      if (url === "https://passport.bilibili.com/") {
        return { ac_time_value: "token", buvid3: "buvid3", buvid4: "buvid4" };
      }

      return {};
    });

    const query = createChromeCookieQuery({
      loadChromeCookiesSecure: async () => ({ getCookiesPromised }),
    });

    await expect(query()).resolves.toEqual(expect.arrayContaining([
      { name: "SESSDATA", value: "sess", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "bili_jct", value: "csrf", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "DedeUserID", value: "123", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "ac_time_value", value: "token", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "buvid3", value: "buvid3", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      { name: "buvid4", value: "buvid4", domain: ".bilibili.com", meta: { browser: "Chrome" } },
    ]));

    expect(getCookiesPromised).toHaveBeenCalledWith("https://www.bilibili.com/", "object");
    expect(getCookiesPromised).toHaveBeenCalledWith("https://passport.bilibili.com/", "object");
  });

  it("returns an empty list when chrome-cookies-secure fails", async () => {
    const query = createChromeCookieQuery({
      loadChromeCookiesSecure: async () => ({
        getCookiesPromised: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    });

    await expect(query()).resolves.toEqual([]);
  });
});
