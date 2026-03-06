import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AuthStore, BiliCredential } from "../types.js";

export class CredentialStore implements AuthStore {
  constructor(
    readonly filePath: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async load(): Promise<BiliCredential | null> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as Record<string, string | undefined>;
      const sessdata = data.sessdata ?? "";
      if (!sessdata) {
        return null;
      }

      const dedeUserId = data.dedeuserid ?? "";
      const cookies = Object.fromEntries(
        Object.entries({
          SESSDATA: sessdata,
          bili_jct: data.bili_jct ?? "",
          ac_time_value: data.ac_time_value ?? "",
          buvid3: data.buvid3 ?? "",
          buvid4: data.buvid4 ?? "",
          DedeUserID: dedeUserId,
        }).filter(([, value]) => value.length > 0),
      );

      return {
        uid: dedeUserId ? Number(dedeUserId) : undefined,
        source: "saved",
        updatedAt: this.now(),
        cookies,
      };
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(credential: BiliCredential) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const dedeUserId = credential.cookies.DedeUserID ?? String(credential.uid ?? "");
    const payload = {
      sessdata: credential.cookies.SESSDATA ?? "",
      bili_jct: credential.cookies.bili_jct ?? "",
      ac_time_value: credential.cookies.ac_time_value ?? "",
      buvid3: credential.cookies.buvid3 ?? "",
      buvid4: credential.cookies.buvid4 ?? "",
      dedeuserid: dedeUserId,
    };
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
  }

  async clear() {
    await rm(this.filePath, { force: true });
  }
}
