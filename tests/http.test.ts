import { describe, expect, it, vi } from "vitest";

import { BiliHttpClient } from "../src/core/http.js";
import type { BiliCredential } from "../src/core/types.js";

const credential: BiliCredential = {
  uid: 1,
  source: "saved",
  updatedAt: "2026-03-06T00:00:00.000Z",
  cookies: { SESSDATA: "sess", bili_jct: "csrf" },
};

describe("BiliHttpClient", () => {
  it("unwraps bilibili json envelopes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { ok: true } })));
    const client = new BiliHttpClient({ fetchImpl, randomId: () => "uuid", now: () => 1710000000000 });

    await expect(client.getJson("/x/web-interface/nav", undefined, { credential })).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("/x/web-interface/nav");
    expect(init.headers.Cookie).toContain("SESSDATA=sess");
  });

  it("adds wbi signature for signed requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
          },
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { mid: 1 } })));

    const client = new BiliHttpClient({ fetchImpl, randomId: () => "uuid", now: () => 1710000000000 });

    await expect(client.getSignedJson("/x/space/wbi/acc/info", { mid: 1 })).resolves.toEqual({ mid: 1 });

    const signedUrl = String(fetchImpl.mock.calls[1][0]);
    expect(signedUrl).toContain("mid=1");
    expect(signedUrl).toContain("wts=");
    expect(signedUrl).toContain("w_rid=");
  });

  it("keeps nav data when bilibili returns unauthenticated code with wbi metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: -101,
          message: "账号未登录",
          data: {
            isLogin: false,
            wbi_img: {
              img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
              sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
            },
          },
        }),
      ),
    );
    const client = new BiliHttpClient({ fetchImpl, randomId: () => "uuid", now: () => 1710000000000 });

    await expect(client.getJson("/x/web-interface/nav")).resolves.toMatchObject({
      isLogin: false,
      wbi_img: {
        img_url: expect.any(String),
      },
    });
  });
});
