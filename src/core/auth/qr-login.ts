import qrcode from "qrcode-terminal";

import { AuthenticationError } from "../errors.js";
import type { BiliCredential, HttpAdapter, QrLoginProvider } from "../types.js";

const QR_GENERATE_URL = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate";
const QR_POLL_URL = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll";

export interface WebQrLoginOptions {
  http: HttpAdapter;
  renderQr?: (url: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  maxAttempts?: number;
  intervalMs?: number;
}

function defaultRenderQr(url: string) {
  qrcode.generate(url, { small: true });
}

function parseCompletedCookies(url: string, refreshToken: string): Record<string, string> {
  const parsed = new URL(url);
  const cookies = Object.fromEntries(parsed.searchParams.entries());
  if (refreshToken) {
    cookies.refresh_token = refreshToken;
  }
  return cookies;
}

export class WebQrLogin implements QrLoginProvider {
  private readonly http: HttpAdapter;
  private readonly renderQr: (url: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => string;
  private readonly maxAttempts: number;
  private readonly intervalMs: number;

  constructor(options: WebQrLoginOptions) {
    this.http = options.http;
    this.renderQr = options.renderQr ?? defaultRenderQr;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxAttempts = options.maxAttempts ?? 180;
    this.intervalMs = options.intervalMs ?? 2000;
  }

  async login(): Promise<BiliCredential> {
    const generated = await this.http.getJson(QR_GENERATE_URL);
    const qrcodeUrl = String(generated?.url ?? "");
    const qrcodeKey = String(generated?.qrcode_key ?? "");
    if (!qrcodeUrl || !qrcodeKey) {
      throw new AuthenticationError("无法获取 Bilibili 登录二维码");
    }

    this.renderQr(qrcodeUrl);

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const polled = await this.http.getJson(QR_POLL_URL, { qrcode_key: qrcodeKey });
      if (polled?.code === 0) {
        const cookies = parseCompletedCookies(String(polled.url ?? ""), String(polled.refresh_token ?? ""));
        const dedeUserId = cookies.DedeUserID;
        return {
          uid: dedeUserId ? Number(dedeUserId) : undefined,
          source: "qr",
          updatedAt: this.now(),
          cookies,
        };
      }

      if (polled?.code === 86038) {
        throw new AuthenticationError("二维码已失效，请重试");
      }

      await this.sleep(this.intervalMs);
    }

    throw new AuthenticationError("二维码登录超时，请重试");
  }
}
