import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { CredentialStore } from "../src/core/auth/credential-store.js";
import type { BiliCredential } from "../src/core/types.js";

const tempPaths: string[] = [];

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), "bili-ts-store-"));
  tempPaths.push(dir);
  return new CredentialStore(join(dir, "credential.json"), () => sampleCredential.updatedAt);
}

const sampleCredential: BiliCredential = {
  uid: 123,
  source: "saved",
  updatedAt: "2026-03-06T00:00:00.000Z",
  cookies: {
    SESSDATA: "sess",
    bili_jct: "csrf",
    DedeUserID: "123",
  },
};

describe("CredentialStore", () => {
  afterEach(async () => {
    await Promise.all(tempPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it("saves and reloads credentials", async () => {
    const store = await makeStore();
    await store.save(sampleCredential);

    await expect(store.load()).resolves.toEqual(sampleCredential);
  });

  it("writes the credential file with json content", async () => {
    const store = await makeStore();
    await store.save(sampleCredential);

    const text = await readFile(store.filePath, "utf8");
    expect(JSON.parse(text)).toEqual({
      sessdata: "sess",
      bili_jct: "csrf",
      ac_time_value: "",
      buvid3: "",
      buvid4: "",
      dedeuserid: "123",
    });
  });

  it("loads compatible credential files", async () => {
    const store = await makeStore();
    const text = JSON.stringify({
      sessdata: "sess",
      bili_jct: "csrf",
      ac_time_value: "token",
      buvid3: "buvid3",
      buvid4: "buvid4",
      dedeuserid: "123",
    }, null, 2);
    await writeFile(store.filePath, text, "utf8");

    await expect(store.load()).resolves.toEqual({
      uid: 123,
      source: "saved",
      updatedAt: expect.any(String),
      cookies: {
        SESSDATA: "sess",
        bili_jct: "csrf",
        ac_time_value: "token",
        buvid3: "buvid3",
        buvid4: "buvid4",
        DedeUserID: "123",
      },
    });
  });

  it("removes saved credentials", async () => {
    const store = await makeStore();
    await store.save(sampleCredential);
    await store.clear();

    await expect(store.load()).resolves.toBeNull();
  });
});
