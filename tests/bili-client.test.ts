import { describe, expect, it, vi } from "vitest";

import { BiliClient } from "../src/core/client.js";
import { BiliApiError } from "../src/core/errors.js";
import type { BiliCredential } from "../src/core/types.js";

const credential: BiliCredential = {
  uid: 1,
  source: "saved",
  updatedAt: "2026-03-06T00:00:00.000Z",
  cookies: { SESSDATA: "sess", bili_jct: "csrf" },
};

describe("BiliClient", () => {
  it("fetches subtitle text through view -> player -> subtitle url", async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({ aid: 1, bvid: "BV1ABcsztEcY", pages: [{ cid: 99 }] })
      .mockResolvedValueOnce({ subtitle: { subtitles: [{ subtitle_url: "https://example.com/subtitle.json" }] } })
      .mockResolvedValueOnce({ body: [{ content: "第一句" }, { content: "第二句" }] });

    const client = new BiliClient({ getJson, getSignedJson: vi.fn() });

    await expect(client.getVideoSubtitle("BV1ABcsztEcY", credential)).resolves.toEqual({
      items: [{ content: "第一句" }, { content: "第二句" }],
      text: "第一句\n第二句",
    });
    expect(getJson).toHaveBeenNthCalledWith(1, "/x/web-interface/view", expect.objectContaining({ bvid: "BV1ABcsztEcY" }), expect.anything());
    expect(getJson).toHaveBeenNthCalledWith(2, "/x/player/v2", expect.objectContaining({ bvid: "BV1ABcsztEcY", cid: 99 }), expect.anything());
    expect(getJson).toHaveBeenNthCalledWith(3, "https://example.com/subtitle.json", undefined, expect.anything());
  });

  it("uses signed endpoints for user info and videos", async () => {
    const getSignedJson = vi
      .fn()
      .mockResolvedValueOnce({ mid: 946974, name: "飓风" })
      .mockResolvedValueOnce({ list: { vlist: [{ bvid: "BV1", title: "视频" }] }, page: { count: 1 } });

    const client = new BiliClient({ getJson: vi.fn(), getSignedJson, getText: vi.fn() });

    await expect(client.getUserInfo(946974)).resolves.toMatchObject({ mid: 946974 });
    await expect(client.getUserVideos(946974, { page: 1, pageSize: 20 })).resolves.toMatchObject({ page: { count: 1 } });
    expect(getSignedJson).toHaveBeenNthCalledWith(
      1,
      "/x/space/wbi/acc/info",
      { mid: 946974, token: "", platform: "web", web_location: "1550101" },
      expect.anything(),
    );
    expect(getSignedJson).toHaveBeenNthCalledWith(
      2,
      "/x/space/wbi/arc/search",
      expect.objectContaining({
        mid: 946974,
        pn: 1,
        ps: 20,
        order: "pubdate",
        platform: "web",
        web_location: "1550101",
        order_avoided: "true",
      }),
      expect.anything(),
    );
  });

  it("falls back to parsing space html when user info is risk controlled", async () => {
    const client = new BiliClient({
      getJson: vi.fn(),
      getSignedJson: vi.fn().mockRejectedValue(new BiliApiError("风控校验失败", { responseCode: -352 })),
      getText: vi
        .fn()
        .mockResolvedValue('<title>影视飓风的个人空间-影视飓风个人主页-哔哩哔哩视频</title><meta name="description" content="哔哩哔哩影视飓风的个人空间，提供影视飓风分享的视频。无限进步！" />'),
    });

    await expect(client.getUserInfo(946974)).resolves.toMatchObject({
      mid: 946974,
      name: "影视飓风",
      sign: expect.stringContaining("无限进步"),
    });
  });
});
