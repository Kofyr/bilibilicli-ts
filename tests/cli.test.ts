import { describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "../src/core/errors.js";
import { createCli, runCli } from "../src/cli.js";
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
      likeVideo: vi.fn().mockResolvedValue({ like: 1 }),
      coinVideo: vi.fn().mockResolvedValue({ multiply: 1 }),
      tripleVideo: vi.fn().mockResolvedValue({ like: true, coin: true, fav: true }),
      unfollowUser: vi.fn().mockResolvedValue({ status: "ok" }),
      getMyDynamics: vi.fn().mockResolvedValue({ cards: [] }),
      postTextDynamic: vi.fn().mockResolvedValue({ dynamic_id: 1001 }),
      deleteDynamic: vi.fn().mockResolvedValue({ status: "ok" }),
    },
    io: {
      write: (value: string) => stdout.push(value),
      writeError: (value: string) => stderr.push(value),
    },
  };

  return { runtime, stdout, stderr };
}

describe("runCli", () => {
  it("exposes parity command groups and subcommands", () => {
    const { runtime } = createRuntime();
    const cli = createCli(runtime);

    expect(cli.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["auth", "me", "video", "user", "search", "discover", "timeline", "library", "interact"]),
    );

    const timeline = cli.commands.find((command) => command.name() === "timeline");
    expect(timeline?.commands.map((command) => command.name())).toEqual(expect.arrayContaining(["feed", "mine", "post", "delete"]));

    const interact = cli.commands.find((command) => command.name() === "interact");
    expect(interact?.commands.map((command) => command.name())).toEqual(expect.arrayContaining(["like", "coin", "triple", "unfollow"]));
  });

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

  it("likes a video through the interact command", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["interact", "like", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.auth.requireCredential).toHaveBeenCalledWith("write");
    expect(runtime.api.likeVideo).toHaveBeenCalledWith("BV1ABcsztEcY", credential);
    expect(stdout.join("")).toContain("已点赞");
  });

  it("coins a video with default count", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["interact", "coin", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.coinVideo).toHaveBeenCalledWith("BV1ABcsztEcY", credential, 1);
    expect(stdout.join("")).toContain("已投 1 枚硬币");
  });

  it("triples a video", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["interact", "triple", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.tripleVideo).toHaveBeenCalledWith("BV1ABcsztEcY", credential);
    expect(stdout.join("")).toContain("一键三连成功");
  });

  it("unfollows a user", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["interact", "unfollow", "946974"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.unfollowUser).toHaveBeenCalledWith(946974, credential);
    expect(stdout.join("")).toContain("已取消关注");
  });

  it("returns an auth error for interact commands without credentials", async () => {
    const { runtime, stderr } = createRuntime();
    runtime.auth.requireCredential.mockRejectedValueOnce(new AuthenticationError("需要写权限登录"));

    const exitCode = await runCli(["interact", "like", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("需要写权限登录");
  });

  it("prints my dynamics", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.api.getMyDynamics.mockResolvedValueOnce({
      cards: [{ desc: { dynamic_id: 1001, timestamp: 1710000000 }, card: JSON.stringify({ item: { content: "测试动态" } }) }],
    });

    const exitCode = await runCli(["timeline", "mine"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.auth.requireCredential).toHaveBeenCalledWith("read");
    expect(runtime.api.getMyDynamics).toHaveBeenCalledWith(credential);
    expect(stdout.join("")).toContain("测试动态");
  });

  it("prints exact dynamic id strings for large ids", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.api.getMyDynamics.mockResolvedValueOnce({
      cards: [{
        desc: {
          dynamic_id: Number("1176582818784870401"),
          dynamic_id_str: "1176582818784870401",
          timestamp: 1710000000,
        },
        card: JSON.stringify({ item: { content: "大整数动态" } }),
      }],
    });

    const exitCode = await runCli(["timeline", "mine"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("1176582818784870401");
    expect(stdout.join("")).not.toContain("1176582818784870400");
  });

  it("posts a text dynamic", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["timeline", "post", "今天也要努力"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.auth.requireCredential).toHaveBeenCalledWith("write");
    expect(runtime.api.postTextDynamic).toHaveBeenCalledWith("今天也要努力", credential);
    expect(stdout.join("")).toContain("已发布动态");
  });

  it("deletes a dynamic", async () => {
    const { runtime, stdout } = createRuntime();
    const dynamicId = "1176582818784870400";

    const exitCode = await runCli(["timeline", "delete", dynamicId], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.deleteDynamic).toHaveBeenCalledWith(dynamicId, credential);
    expect(stdout.join("")).toContain(dynamicId);
  });

  it("rejects empty dynamic text", async () => {
    const { runtime, stderr } = createRuntime();
    runtime.api.postTextDynamic.mockRejectedValueOnce(new Error("动态文本不能为空"));

    const exitCode = await runCli(["timeline", "post", ""], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("动态文本不能为空");
  });
});
