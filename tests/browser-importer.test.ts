import { describe, expect, it, vi } from "vitest";

import { BrowserCredentialImporter } from "../src/core/auth/browser-importer.js";

describe("BrowserCredentialImporter", () => {
  it("builds a credential from extracted browser cookies", async () => {
    const importer = new BrowserCredentialImporter({
      queryCookies: vi.fn().mockResolvedValue([
        { name: "SESSDATA", value: "sess", domain: ".bilibili.com", meta: { browser: "Chrome" } },
        { name: "bili_jct", value: "csrf", domain: ".bilibili.com", meta: { browser: "Chrome" } },
        { name: "DedeUserID", value: "123", domain: ".bilibili.com", meta: { browser: "Chrome" } },
      ]),
      now: () => "2026-03-06T00:00:00.000Z",
    });

    await expect(importer.importCredential()).resolves.toEqual({
      uid: 123,
      browser: "Chrome",
      source: "browser",
      updatedAt: "2026-03-06T00:00:00.000Z",
      cookies: {
        SESSDATA: "sess",
        bili_jct: "csrf",
        DedeUserID: "123",
      },
    });
  });

  it("returns null when SESSDATA is missing", async () => {
    const importer = new BrowserCredentialImporter({
      queryCookies: vi.fn().mockResolvedValue([{ name: "bili_jct", value: "csrf", domain: ".bilibili.com" }]),
      now: () => "2026-03-06T00:00:00.000Z",
    });

    await expect(importer.importCredential()).resolves.toBeNull();
  });
});
