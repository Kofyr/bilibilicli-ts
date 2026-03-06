import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AuthStore, BiliCredential } from "../types.js";

export class CredentialStore implements AuthStore {
  constructor(readonly filePath: string) {}

  async load(): Promise<BiliCredential | null> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as BiliCredential;
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(credential: BiliCredential) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(credential, null, 2), { encoding: "utf8", mode: 0o600 });
  }

  async clear() {
    await rm(this.filePath, { force: true });
  }
}
