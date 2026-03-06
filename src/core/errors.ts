export class BiliCliError extends Error {
  readonly code: string;

  constructor(message: string, code = "BILI_CLI_ERROR") {
    super(message);
    this.name = "BiliCliError";
    this.code = code;
  }
}

export class AuthenticationError extends BiliCliError {
  constructor(message: string) {
    super(message, "AUTHENTICATION_ERROR");
    this.name = "AuthenticationError";
  }
}

export class BiliApiError extends BiliCliError {
  readonly status?: number;
  readonly responseCode?: number;

  constructor(message: string, options?: { status?: number; responseCode?: number }) {
    super(message, "BILI_API_ERROR");
    this.name = "BiliApiError";
    this.status = options?.status;
    this.responseCode = options?.responseCode;
  }
}
