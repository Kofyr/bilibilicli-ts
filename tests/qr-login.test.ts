import { describe, expect, it, vi } from "vitest";

import { WebQrLogin } from "../src/core/auth/qr-login.js";

describe("WebQrLogin", () => {
  it("renders the qr url and stores cookies from the completed callback url", async () => {
    const renderQr = vi.fn();
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({ url: "https://passport.bilibili.com/login?foo=bar", qrcode_key: "abc" })
      .mockResolvedValueOnce({ code: 86101, message: "未扫码" })
      .mockResolvedValueOnce({
        code: 0,
        url: "https://www.bilibili.com/?DedeUserID=123&SESSDATA=sess&bili_jct=csrf",
        refresh_token: "refresh-token",
      });

    const login = new WebQrLogin({
      http: { getJson, getSignedJson: vi.fn() },
      renderQr,
      sleep: async () => undefined,
      now: () => "2026-03-06T00:00:00.000Z",
      maxAttempts: 3,
    });

    await expect(login.login()).resolves.toEqual({
      uid: 123,
      source: "qr",
      updatedAt: "2026-03-06T00:00:00.000Z",
      cookies: {
        DedeUserID: "123",
        SESSDATA: "sess",
        bili_jct: "csrf",
        refresh_token: "refresh-token",
      },
    });
    expect(renderQr).toHaveBeenCalledWith("https://passport.bilibili.com/login?foo=bar");
  });
});
