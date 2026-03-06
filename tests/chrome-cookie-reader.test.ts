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

  it("returns an empty list when chrome-cookies-secure fails", async () => {
    const query = createChromeCookieQuery({
      loadChromeCookiesSecure: async () => ({
        getCookiesPromised: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    });

    await expect(query()).resolves.toEqual([]);
  });
});
