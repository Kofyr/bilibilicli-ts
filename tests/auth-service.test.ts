import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../src/core/auth/auth-service.js";
import type { BiliCredential } from "../src/core/types.js";

const savedCredential: BiliCredential = {
  uid: 1,
  source: "saved",
  updatedAt: "2026-03-06T00:00:00.000Z",
  cookies: { SESSDATA: "saved" },
};

const browserCredential: BiliCredential = {
  uid: 2,
  source: "browser",
  updatedAt: "2026-03-06T00:00:00.000Z",
  cookies: { SESSDATA: "browser", bili_jct: "csrf" },
};

describe("AuthService", () => {
  it("prefers a valid saved credential", async () => {
    const store = {
      load: vi.fn().mockResolvedValue(savedCredential),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const service = new AuthService({
      store,
      browserImporter: { importCredential: vi.fn().mockResolvedValue(null) },
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValue("valid"),
    });

    await expect(service.getCredential("read")).resolves.toEqual(savedCredential);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it("accepts an indeterminate saved credential without clearing it", async () => {
    const store = {
      load: vi.fn().mockResolvedValue(savedCredential),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const service = new AuthService({
      store,
      browserImporter: { importCredential: vi.fn().mockResolvedValue(browserCredential) },
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValue("indeterminate"),
    });

    await expect(service.getCredential("read")).resolves.toEqual(savedCredential);
    expect(store.clear).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("clears an invalid saved credential and falls back to browser cookies", async () => {
    const store = {
      load: vi.fn().mockResolvedValue(savedCredential),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const service = new AuthService({
      store,
      browserImporter: { importCredential: vi.fn().mockResolvedValue(browserCredential) },
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValueOnce("invalid").mockResolvedValueOnce("valid"),
    });

    await expect(service.getCredential("write")).resolves.toEqual(browserCredential);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledWith(browserCredential);
  });

  it("returns null for optional mode after clearing an invalid saved credential", async () => {
    const store = {
      load: vi.fn().mockResolvedValue(savedCredential),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const browserImporter = { importCredential: vi.fn().mockResolvedValue(browserCredential) };
    const service = new AuthService({
      store,
      browserImporter,
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValue("invalid"),
    });

    await expect(service.getCredential("optional")).resolves.toBeNull();
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(browserImporter.importCredential).not.toHaveBeenCalled();
  });

  it("returns null when imported browser credentials are invalid", async () => {
    const store = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const service = new AuthService({
      store,
      browserImporter: { importCredential: vi.fn().mockResolvedValue(browserCredential) },
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValue("invalid"),
    });

    await expect(service.getCredential("write")).resolves.toBeNull();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("throws when requireCredential cannot find a usable credential", async () => {
    const service = new AuthService({
      store: { load: vi.fn().mockResolvedValue(null), save: vi.fn(), clear: vi.fn() },
      browserImporter: { importCredential: vi.fn().mockResolvedValue(null) },
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValue("invalid"),
    });

    await expect(service.requireCredential("read")).rejects.toThrow("未找到可用凭证");
  });

  it("uses qr login for explicit login", async () => {
    const qrCredential: BiliCredential = {
      uid: 9,
      source: "qr",
      updatedAt: "2026-03-06T00:00:00.000Z",
      cookies: { SESSDATA: "qr", bili_jct: "csrf" },
    };
    const qrLogin = { login: vi.fn().mockResolvedValue(qrCredential) };
    const service = new AuthService({
      store: { load: vi.fn(), save: vi.fn(), clear: vi.fn() },
      browserImporter: { importCredential: vi.fn().mockResolvedValue(browserCredential) },
      qrLogin,
      validator: vi.fn().mockResolvedValue("valid"),
    });

    await expect(service.login()).resolves.toMatchObject({
      credential: qrCredential,
      method: "qr",
    });
    expect(qrLogin.login).toHaveBeenCalledTimes(1);
  });

  it("clears the store on logout", async () => {
    const store = { load: vi.fn(), save: vi.fn(), clear: vi.fn().mockResolvedValue(undefined) };
    const service = new AuthService({
      store,
      browserImporter: { importCredential: vi.fn().mockResolvedValue(browserCredential) },
      qrLogin: { login: vi.fn() },
      validator: vi.fn().mockResolvedValue("valid"),
    });

    await expect(service.logout()).resolves.toBeUndefined();
    expect(store.clear).toHaveBeenCalledTimes(1);
  });
});
