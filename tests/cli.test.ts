import { describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "../src/core/errors.js";
import { runCli } from "../src/cli.js";
import type { BiliCredential } from "../src/core/types.js";

const credential: BiliCredential = {
  uid: 123,
  source: "saved",
  updatedAt: "2026-03-06T00:00:00.000Z",
  cookies: { SESSDATA: "sess", bili_jct: "csrf" },
};

function createRuntime() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const runtime = {
    auth: {
      getCredential: vi.fn().mockResolvedValue(credential),
      requireCredential: vi.fn().mockResolvedValue(credential),
      login: vi.fn().mockResolvedValue({ credential, method: "browser" }),
      logout: vi.fn().mockResolvedValue(undefined),
    },
    api: {
      getSelfInfo: vi.fn().mockResolvedValue({ isLogin: true, uname: "Dash", mid: 123, money: 88 }),
      getRelationStat: vi.fn().mockResolvedValue({ follower: 1000, following: 20 }),
      searchUsers: vi.fn().mockResolvedValue([{ mid: 946974, uname: "影视飓风", fans: 100 }]),
      getUserInfo: vi.fn().mockResolvedValue({ mid: 946974, name: "影视飓风", sign: "hello" }),
      getUserVideos: vi.fn().mockResolvedValue({ list: { vlist: [] }, page: { count: 0 } }),
      getVideoInfo: vi.fn().mockResolvedValue({ bvid: "BV1ABcsztEcY", title: "测试视频", owner: { name: "UP" }, stat: { view: 10 } }),
      getVideoSubtitle: vi.fn().mockResolvedValue({ text: "字幕", items: [] }),
      getVideoSummary: vi.fn().mockResolvedValue({ text: "总结", segments: [] }),
      getVideoComments: vi.fn().mockResolvedValue({ replies: [] }),
      getRelatedVideos: vi.fn().mockResolvedValue([]),
      getHotVideos: vi.fn().mockResolvedValue({ list: [{ bvid: "BV1hot", title: "热门视频", owner: { name: "UP" }, stat: { view: 10, like: 2 } }] }),
      getRankVideos: vi.fn().mockResolvedValue({ list: [] }),
      searchVideos: vi.fn().mockResolvedValue([]),
      getFavoriteFolders: vi.fn().mockResolvedValue({ list: [{ id: 1, title: "默认收藏夹", media_count: 2 }] }),
      getFavoriteItems: vi.fn().mockResolvedValue({ medias: [] }),
      getFollowing: vi.fn().mockResolvedValue({ list: [] }),
      getHistory: vi.fn().mockResolvedValue({ list: [] }),
      getWatchLater: vi.fn().mockResolvedValue({ list: [] }),
      getFeed: vi.fn().mockResolvedValue({ items: [] }),
    },
    io: {
      write: (value: string) => stdout.push(value),
      writeError: (value: string) => stderr.push(value),
    },
  };

  return { runtime, stdout, stderr };
}

describe("runCli", () => {
  it("prints auth status", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Dash");
  });

  it("prints video details as json", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["video", "show", "BV1ABcsztEcY", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ info: { bvid: "BV1ABcsztEcY" } });
  });

  it("resolves user names through search", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["user", "show", "影视飓风"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.searchUsers).toHaveBeenCalledWith("影视飓风", 1, 5, null);
    expect(stdout.join("")).toContain("影视飓风");
  });

  it("returns an auth error for feed without credentials", async () => {
    const { runtime, stderr } = createRuntime();
    runtime.auth.requireCredential.mockRejectedValueOnce(new AuthenticationError("需要登录"));

    const exitCode = await runCli(["timeline", "feed"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("需要登录");
  });
});
