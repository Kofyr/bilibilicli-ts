import { homedir } from "node:os";
import { join } from "node:path";

import { AuthService } from "./core/auth/auth-service.js";
import { BrowserCredentialImporter } from "./core/auth/browser-importer.js";
import { CredentialStore } from "./core/auth/credential-store.js";
import { WebQrLogin } from "./core/auth/qr-login.js";
import { AudioService, type AudioDownloadInfo, type AudioDownloadOptions, type AudioDownloadResult } from "./core/audio.js";
import { BiliClient } from "./core/client.js";
import { BiliHttpClient } from "./core/http.js";
import type { AuthMode, BiliCredential } from "./core/types.js";

export interface CliIo {
  write(value: string): void;
  writeError(value: string): void;
}

export interface CliRuntime {
  auth: {
    getCredential(mode: AuthMode): Promise<BiliCredential | null>;
    requireCredential(mode: Exclude<AuthMode, "optional">): Promise<BiliCredential>;
    login(): Promise<{ credential: BiliCredential; method: "qr" }>;
    logout(): Promise<void>;
  };
  api: BiliClient;
  audio: {
    download(info: AudioDownloadInfo, options: AudioDownloadOptions): Promise<AudioDownloadResult>;
  };
  io: CliIo;
}

export function resolveCredentialPath() {
  const envPath = process.env.BILI_TS_CREDENTIAL_PATH;
  if (envPath) {
    return envPath;
  }

  return join(homedir(), ".bilibili-cli", "credential.json");
}

export function createDefaultRuntime(): CliRuntime {
  const credentialPath = resolveCredentialPath();
  const http = new BiliHttpClient();
  const api = new BiliClient(http);
  const auth = new AuthService({
    store: new CredentialStore(credentialPath),
    browserImporter: new BrowserCredentialImporter(),
    qrLogin: new WebQrLogin({ http }),
    validator: (credential, mode) => {
      if (mode === "optional") {
        return Promise.resolve(credential.cookies.SESSDATA ? "valid" : "invalid");
      }

      return api.validateCredential(credential, mode);
    },
  });

  return {
    auth,
    api,
    audio: new AudioService(),
    io: {
      write: (value) => {
        process.stdout.write(value);
      },
      writeError: (value) => {
        process.stderr.write(value);
      },
    },
  };
}
