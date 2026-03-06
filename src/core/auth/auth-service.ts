import { AuthenticationError } from "../errors.js";
import type {
  AuthMode,
  AuthStore,
  BiliCredential,
  BrowserCredentialImporter,
  QrLoginProvider,
  ValidationState,
} from "../types.js";

export interface AuthServiceOptions {
  store: AuthStore;
  browserImporter: BrowserCredentialImporter;
  qrLogin: QrLoginProvider;
  validator: (credential: BiliCredential, mode: AuthMode) => Promise<ValidationState>;
}

export class AuthService {
  private readonly store: AuthStore;
  private readonly browserImporter: BrowserCredentialImporter;
  private readonly qrLogin: QrLoginProvider;
  private readonly validator: AuthServiceOptions["validator"];

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.browserImporter = options.browserImporter;
    this.qrLogin = options.qrLogin;
    this.validator = options.validator;
  }

  async getCredential(mode: AuthMode): Promise<BiliCredential | null> {
    const savedCredential = await this.store.load();
    if (savedCredential) {
      const validation = await this.validator(savedCredential, mode);
      if (validation === "valid" || validation === "indeterminate") {
        return savedCredential;
      }

      await this.store.clear();
    }

    if (mode === "optional") {
      return null;
    }

    const browserCredential = await this.browserImporter.importCredential();
    if (!browserCredential) {
      return null;
    }

    const validation = await this.validator(browserCredential, mode);
    if (validation === "invalid") {
      return null;
    }

    await this.store.save(browserCredential);
    return browserCredential;
  }

  async requireCredential(mode: Exclude<AuthMode, "optional">): Promise<BiliCredential> {
    const credential = await this.getCredential(mode);
    if (!credential) {
      throw new AuthenticationError("未找到可用凭证，请先执行 bili-ts auth login");
    }

    return credential;
  }

  async login(): Promise<{ credential: BiliCredential; method: "browser" | "qr" }> {
    const browserCredential = await this.browserImporter.importCredential();
    if (browserCredential) {
      const validation = await this.validator(browserCredential, "read");
      if (validation !== "invalid") {
        await this.store.save(browserCredential);
        return { credential: browserCredential, method: "browser" };
      }
    }

    const qrCredential = await this.qrLogin.login();
    await this.store.save(qrCredential);
    return { credential: qrCredential, method: "qr" };
  }

  async logout() {
    await this.store.clear();
  }
}
