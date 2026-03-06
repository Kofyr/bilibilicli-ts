import { describe, expect, it, vi } from "vitest";

import { resolveCredentialPath } from "../src/runtime.js";

describe("resolveCredentialPath", () => {
  it("matches the python cli credential path by default", () => {
    const original = process.env.BILI_TS_CREDENTIAL_PATH;
    delete process.env.BILI_TS_CREDENTIAL_PATH;

    try {
      expect(resolveCredentialPath()).toMatch(/\.bilibili-cli\/credential\.json$/);
    } finally {
      if (original === undefined) {
        delete process.env.BILI_TS_CREDENTIAL_PATH;
      } else {
        process.env.BILI_TS_CREDENTIAL_PATH = original;
      }
    }
  });

  it("still respects the explicit env override", () => {
    const original = process.env.BILI_TS_CREDENTIAL_PATH;
    process.env.BILI_TS_CREDENTIAL_PATH = "/tmp/custom-credential.json";

    try {
      expect(resolveCredentialPath()).toBe("/tmp/custom-credential.json");
    } finally {
      if (original === undefined) {
        delete process.env.BILI_TS_CREDENTIAL_PATH;
      } else {
        process.env.BILI_TS_CREDENTIAL_PATH = original;
      }
    }
  });
});
