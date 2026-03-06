import { describe, expect, it, vi } from "vitest";

import { WebQrLogin } from "../src/core/auth/qr-login.js";

function createHttp(getJson: ReturnType<typeof vi.fn>) {
  return {
    getJson,
    getSignedJson: vi.fn(),
    getText: vi.fn(),
    postJson: vi.fn(),
    postJsonBody: vi.fn(),
  };
}

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
      http: createHttp(getJson),
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

  it("rejects login when qr code generation response is incomplete", async () => {
    const login = new WebQrLogin({
      http: createHttp(vi.fn().mockResolvedValue({ url: "", qrcode_key: "" })),
      sleep: async () => undefined,
      maxAttempts: 1,
    });

    await expect(login.login()).rejects.toThrow("无法获取 Bilibili 登录二维码");
  });

  it("rejects login when the qr code expires", async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({ url: "https://passport.bilibili.com/login?foo=bar", qrcode_key: "abc" })
      .mockResolvedValueOnce({ code: 86038, message: "二维码已失效" });
    const login = new WebQrLogin({
      http: createHttp(getJson),
      renderQr: vi.fn(),
      sleep: async () => undefined,
      maxAttempts: 3,
    });

    await expect(login.login()).rejects.toThrow("二维码已失效，请重试");
  });

  it("rejects login when polling times out", async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({ url: "https://passport.bilibili.com/login?foo=bar", qrcode_key: "abc" })
      .mockResolvedValue({ code: 86101, message: "未扫码" });
    const login = new WebQrLogin({
      http: createHttp(getJson),
      renderQr: vi.fn(),
      sleep: async () => undefined,
      maxAttempts: 2,
    });

    await expect(login.login()).rejects.toThrow("二维码登录超时，请重试");
  });
});
