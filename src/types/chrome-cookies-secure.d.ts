declare module "chrome-cookies-secure" {
  export function getCookiesPromised(
    uri: string,
    format: "object" | "jar" | "header" | "curl" | "set-cookie" | "puppeteer",
    profileOrPath?: string,
  ): Promise<any>;

  const chromeCookiesSecure: {
    getCookiesPromised: typeof getCookiesPromised;
  };

  export default chromeCookiesSecure;
}
