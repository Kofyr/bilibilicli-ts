export interface BiliCredential {
  uid?: number;
  accessToken?: string;
  source: "saved" | "browser" | "qr";
  browser?: string;
  updatedAt: string;
  cookies: Record<string, string>;
}

export type AuthMode = "optional" | "read" | "write";

export type ValidationState = "valid" | "invalid" | "indeterminate";

export interface RequestOptions {
  credential?: BiliCredential | null;
  headers?: Record<string, string>;
  referer?: string;
}

export interface HttpAdapter {
  getJson(pathOrUrl: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<any>;
  getSignedJson(path: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<any>;
  getText(pathOrUrl: string, options?: RequestOptions): Promise<string>;
  postJson(pathOrUrl: string, data?: Record<string, unknown>, options?: RequestOptions): Promise<any>;
  postJsonBody(pathOrUrl: string, data?: Record<string, unknown>, options?: RequestOptions): Promise<any>;
}

export interface AuthStore {
  load(): Promise<BiliCredential | null>;
  save(credential: BiliCredential): Promise<void>;
  clear(): Promise<void>;
}

export interface BrowserCredentialImporter {
  importCredential(): Promise<BiliCredential | null>;
}

export interface QrLoginProvider {
  login(): Promise<BiliCredential>;
}
