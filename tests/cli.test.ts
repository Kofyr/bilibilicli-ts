import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "../src/core/errors.js";
import { createCli, runCli } from "../src/cli.js";
import type { BiliCredential } from "../src/core/types.js";

const credential: BiliCredential = {
  uid: 123,
  source: "browser",
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
      login: vi.fn().mockResolvedValue({ credential, method: "qr" }),
      logout: vi.fn().mockResolvedValue(undefined),
    },
    api: {
      getSelfInfo: vi.fn().mockResolvedValue({
        isLogin: true,
        uname: "Dash",
        mid: 123,
        money: 88,
        sign: "保持热爱",
        level_info: { current_level: 6 },
        vip: { status: 1, type: 2 },
      }),
      getRelationStat: vi.fn().mockResolvedValue({ follower: 1000, following: 20 }),
      searchUsers: vi.fn().mockResolvedValue([{ mid: 946974, uname: "影视飓风", fans: 100, videos: 30, usign: "无限进步" }]),
      getUserInfo: vi.fn().mockResolvedValue({ mid: 946974, name: "影视飓风", sign: "hello", level: 6 }),
      getUserVideos: vi.fn().mockResolvedValue({
        list: {
          vlist: [{ bvid: "BV1user", title: "用户视频", length: "12:34", play: 1234 }],
        },
        page: { count: 1 },
      }),
      getVideoInfo: vi.fn().mockResolvedValue({
        bvid: "BV1ABcsztEcY",
        title: "测试视频",
        duration: 3661,
        owner: { name: "UP", mid: 9527 },
        stat: { view: 10, danmaku: 20, like: 30, coin: 40, favorite: 50, share: 60 },
      }),
      getVideoSubtitle: vi.fn().mockResolvedValue({ text: "字幕", items: [] }),
      getVideoSummary: vi.fn().mockResolvedValue({ text: "总结", segments: [] }),
      getVideoComments: vi.fn().mockResolvedValue({ replies: [] }),
      getRelatedVideos: vi.fn().mockResolvedValue([]),
      getHotVideos: vi.fn().mockResolvedValue({ list: [{ bvid: "BV1hot", title: "热门视频", owner: { name: "UP" }, stat: { view: 10, like: 2 } }] }),
      getRankVideos: vi.fn().mockResolvedValue({ list: [] }),
      searchVideos: vi.fn().mockResolvedValue([{ bvid: "BV1search", title: "<em>搜索</em>视频", author: "UP主", play: 123, duration: "12:34" }]),
      getFavoriteFolders: vi.fn().mockResolvedValue({ list: [{ id: 1, title: "默认收藏夹", media_count: 2 }] }),
      getFavoriteItems: vi.fn().mockResolvedValue({ medias: [{ bvid: "BV1fav", title: "收藏视频", upper: { name: "收藏UP" }, duration: 95 }] }),
      getFollowing: vi.fn().mockResolvedValue({ list: [{ mid: 1, uname: "关注UP", fans: 200, sign: "签名内容" }] }),
      getHistory: vi.fn().mockResolvedValue([{ history: { bvid: "BV1his", view_at: 1710000000 }, title: "历史视频", owner: { name: "历史UP" } }]),
      getWatchLater: vi.fn().mockResolvedValue({ list: [{ bvid: "BV1later", title: "稍后再看视频", owner: { name: "稍后UP" }, duration: 125 }] }),
      getFeed: vi.fn().mockResolvedValue({
        items: [{
          id_str: "1001",
          modules: {
            module_author: { name: "动态作者", pub_time: "03-07 12:00" },
            module_dynamic: {
              desc: { text: "动态内容" },
              major: { archive: { title: "动态视频标题" } },
            },
            module_stat: { like: { count: 10 }, comment: { count: 2 } },
          },
        }],
        next_offset: "next-cursor",
      }),
      likeVideo: vi.fn().mockResolvedValue({ like: 1 }),
      coinVideo: vi.fn().mockResolvedValue({ multiply: 1 }),
      tripleVideo: vi.fn().mockResolvedValue({ like: true, coin: true, fav: true }),
      unfollowUser: vi.fn().mockResolvedValue({ status: "ok" }),
      getMyDynamics: vi.fn().mockResolvedValue({ cards: [] }),
      postTextDynamic: vi.fn().mockResolvedValue({ dynamic_id: 1001 }),
      deleteDynamic: vi.fn().mockResolvedValue({ status: "ok" }),
      getAudioDownloadInfo: vi.fn().mockResolvedValue({
        bvid: "BV1ABcsztEcY",
        title: "测试视频",
        duration: 120,
        url: "https://example.com/audio.m4s",
      }),
    },
    audio: {
      download: vi.fn().mockResolvedValue({
        outputDir: "/tmp/audio",
        files: ["/tmp/audio/测试视频.m4a"],
        downloadedBytes: 1024,
        title: "测试视频",
        duration: 120,
        split: false,
      }),
    },
    io: {
      write: (value: string) => stdout.push(value),
      writeError: (value: string) => stderr.push(value),
    },
  };

  return { runtime, stdout, stderr };
}

describe("runCli", () => {
  it("exposes the expected command groups and subcommands", () => {
    const { runtime } = createRuntime();
    const cli = createCli(runtime);

    expect(cli.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["auth", "me", "video", "user", "search", "discover", "timeline", "library", "interact", "audio"]),
    );

    const timeline = cli.commands.find((command) => command.name() === "timeline");
    expect(timeline?.commands.map((command) => command.name())).toEqual(expect.arrayContaining(["feed", "mine", "post", "delete"]));

    const interact = cli.commands.find((command) => command.name() === "interact");
    expect(interact?.commands.map((command) => command.name())).toEqual(expect.arrayContaining(["like", "coin", "triple", "unfollow"]));

    const auth = cli.commands.find((command) => command.name() === "auth");
    expect(auth?.commands.map((command) => command.name())).toEqual(expect.arrayContaining(["status", "login", "logout"]));
  });

  it("prints auth status", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["auth", "status"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Dash");
    expect(stdout.join("")).not.toContain("凭证来源");
  });

  it("prints richer me output", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["me"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("等级: 6");
    expect(stdout.join("")).toContain("会员: 大会员");
    expect(stdout.join("")).toContain("签名: 保持热爱");
  });

  it("runs qr login through auth login", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["auth", "login"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.auth.login).toHaveBeenCalledWith();
    expect(stdout.join("")).toContain("登录成功");
  });

  it("prints video details as json", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["video", "show", "BV1ABcsztEcY", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ info: { bvid: "BV1ABcsztEcY" } });
  });

  it("prints richer video details in text mode", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["video", "show", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("时长: 1:01:01");
    expect(stdout.join("")).toContain("弹幕: 20");
    expect(stdout.join("")).toContain("投币: 40");
    expect(stdout.join("")).toContain("收藏: 50");
    expect(stdout.join("")).toContain("分享: 60");
  });

  it("resolves user names through search", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["user", "show", "影视飓风"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.searchUsers).toHaveBeenCalledWith("影视飓风", 1, 5, null);
    expect(stdout.join("")).toContain("影视飓风");
  });

  it("prints richer user output with relation stats", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["user", "show", "影视飓风"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("等级: 6");
    expect(stdout.join("")).toContain("粉丝: 1000");
    expect(stdout.join("")).toContain("关注: 20");
  });

  it("resolves user names for user videos", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["user", "videos", "影视飓风", "--page", "2", "--max", "5"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.searchUsers).toHaveBeenCalledWith("影视飓风", 1, 5, null);
    expect(runtime.api.getUserVideos).toHaveBeenCalledWith(946974, { page: 2, pageSize: 5 }, credential);
    expect(stdout.join("")).toContain("12:34");
  });

  it("prints richer search output", async () => {
    let current = createRuntime();
    let exitCode = await runCli(["search", "users", "影视飓风"], current.runtime);

    expect(exitCode).toBe(0);
    expect(current.stdout.join("")).toContain("无限进步");
    expect(current.stdout.join("")).toContain("30");

    current = createRuntime();
    exitCode = await runCli(["search", "videos", "测试"], current.runtime);

    expect(exitCode).toBe(0);
    expect(current.stdout.join("")).toContain("12:34");
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
    expect(runtime.api.likeVideo).toHaveBeenCalledWith("BV1ABcsztEcY", credential, false);
    expect(stdout.join("")).toContain("已点赞");
  });

  it("unlikes a video through the interact command", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["interact", "like", "BV1ABcsztEcY", "--undo"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.auth.requireCredential).toHaveBeenCalledWith("write");
    expect(runtime.api.likeVideo).toHaveBeenCalledWith("BV1ABcsztEcY", credential, true);
    expect(stdout.join("")).toContain("已取消点赞");
  });

  it("coins a video with default count", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["interact", "coin", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.coinVideo).toHaveBeenCalledWith("BV1ABcsztEcY", credential, 1);
    expect(stdout.join("")).toContain("已投 1 枚硬币");
  });

  it("limits rank output with max", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.api.getRankVideos.mockResolvedValueOnce({
      list: [
        { bvid: "BV1first", title: "第一个视频", owner: { name: "A" }, stat: { view: 10 } },
        { bvid: "BV1second", title: "第二个视频", owner: { name: "B" }, stat: { view: 20 } },
      ],
    });

    const exitCode = await runCli(["discover", "rank", "--day", "7", "--max", "1"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.getRankVideos).toHaveBeenCalledWith(7, null);
    expect(stdout.join("")).toContain("第一个视频");
    expect(stdout.join("")).not.toContain("第二个视频");
  });

  it("prints richer discovery output", async () => {
    let current = createRuntime();
    let exitCode = await runCli(["discover", "hot"], current.runtime);

    expect(exitCode).toBe(0);
    expect(current.stdout.join("")).toContain("点赞");
    expect(current.stdout.join("")).toContain("2");

    current = createRuntime();
    current.runtime.api.getRankVideos.mockResolvedValueOnce({
      list: [{ bvid: "BV1rank", title: "排行视频", owner: { name: "排行UP" }, stat: { view: 99 }, score: 8888 }],
    });

    exitCode = await runCli(["discover", "rank"], current.runtime);

    expect(exitCode).toBe(0);
    expect(current.stdout.join("")).toContain("综合分");
    expect(current.stdout.join("")).toContain("8888");
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

    const exitCode = await runCli(["interact", "unfollow", "946974", "--yes"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.unfollowUser).toHaveBeenCalledWith(946974, credential);
    expect(stdout.join("")).toContain("已取消关注");
  });

  it("prints unfollow json output", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.api.unfollowUser.mockResolvedValueOnce({ status: "ok", fid: 946974 });

    const exitCode = await runCli(["interact", "unfollow", "946974", "--yes", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ status: "ok", fid: 946974 });
  });

  it("returns an auth error for interact commands without credentials", async () => {
    const { runtime, stderr } = createRuntime();
    runtime.auth.requireCredential.mockRejectedValueOnce(new AuthenticationError("需要写权限登录"));

    const exitCode = await runCli(["interact", "like", "BV1ABcsztEcY"], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("需要写权限登录");
  });

  it("prints richer feed output", async () => {
    const { runtime, stdout } = createRuntime();

    const exitCode = await runCli(["timeline", "feed"], runtime);

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("动态视频标题");
    expect(stdout.join("")).toContain("点赞: 10  评论: 2");
    expect(stdout.join("")).toContain("下一页 offset: next-cursor");
  });

  it("prints my dynamics", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.api.getMyDynamics.mockResolvedValueOnce({
      cards: [{ desc: { dynamic_id: 1001, timestamp: 1710000000 }, card: JSON.stringify({ item: { content: "测试动态" } }) }],
    });

    const exitCode = await runCli(["timeline", "mine"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.auth.requireCredential).toHaveBeenCalledWith("read");
    expect(runtime.api.getMyDynamics).toHaveBeenCalledWith(credential, 0, false);
    expect(stdout.join("")).toContain("测试动态");
  });

  it("passes mine pagination options through", async () => {
    const { runtime } = createRuntime();

    const exitCode = await runCli(["timeline", "mine", "--offset", "123", "--top", "--max", "5"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.getMyDynamics).toHaveBeenCalledWith(credential, 123, true);
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

  it("posts a text dynamic from file as json", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.api.postTextDynamic.mockResolvedValueOnce({ dynamic_id: 2002, status: "ok" });
    const tempDir = await mkdtemp(join(tmpdir(), "bili-cli-"));
    const filePath = join(tempDir, "dynamic.txt");

    try {
      await writeFile(filePath, "从文件发动态\n", "utf8");

      const exitCode = await runCli(["timeline", "post", "--from-file", filePath, "--json"], runtime);

      expect(exitCode).toBe(0);
      expect(runtime.api.postTextDynamic).toHaveBeenCalledWith("从文件发动态", credential);
      expect(JSON.parse(stdout.join(""))).toMatchObject({ dynamic_id: 2002, status: "ok" });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("deletes a dynamic", async () => {
    const { runtime, stdout } = createRuntime();
    const dynamicId = "1176582818784870400";

    const exitCode = await runCli(["timeline", "delete", dynamicId, "--yes"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.deleteDynamic).toHaveBeenCalledWith(dynamicId, credential);
    expect(stdout.join("")).toContain(dynamicId);
  });

  it("prints delete json output", async () => {
    const { runtime, stdout } = createRuntime();
    const dynamicId = "1176582818784870400";
    runtime.api.deleteDynamic.mockResolvedValueOnce({ status: "ok", dynamic_id: dynamicId });

    const exitCode = await runCli(["timeline", "delete", dynamicId, "--yes", "--json"], runtime);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ status: "ok", dynamic_id: dynamicId });
  });

  it("passes library pagination options through", async () => {
    const { runtime, stdout } = createRuntime();

    let exitCode = await runCli(["library", "following", "--page", "3"], runtime);
    expect(exitCode).toBe(0);
    expect(runtime.api.getFollowing).toHaveBeenCalledWith(3, 20, credential);
    expect(stdout.join("")).toContain("签名内容");

    exitCode = await runCli(["library", "history", "--page", "2", "--max", "15"], runtime);
    expect(exitCode).toBe(0);
    expect(runtime.api.getHistory).toHaveBeenCalledWith({ page: 2, pageSize: 15 }, credential);
    expect(stdout.join("")).toContain("观看时间");
  });

  it("prints richer favorites and watch later output", async () => {
    let current = createRuntime();
    let exitCode = await runCli(["library", "favorites", "1"], current.runtime);

    expect(exitCode).toBe(0);
    expect(current.stdout.join("")).toContain("时长");

    current = createRuntime();
    exitCode = await runCli(["library", "watch-later"], current.runtime);

    expect(exitCode).toBe(0);
    expect(current.stdout.join("")).toContain("02:05");
  });

  it("rejects empty dynamic text", async () => {
    const { runtime, stderr } = createRuntime();
    runtime.api.postTextDynamic.mockRejectedValueOnce(new Error("动态文本不能为空"));

    const exitCode = await runCli(["timeline", "post", ""], runtime);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("动态文本不能为空");
  });

  it("downloads full audio without splitting", async () => {
    const { runtime, stdout } = createRuntime();
    runtime.audio.download.mockResolvedValueOnce({
      outputDir: "/tmp/audio",
      files: ["/tmp/audio/测试视频.m4a"],
      downloadedBytes: 1024,
      title: "测试视频",
      duration: 120,
      split: false,
    });

    const exitCode = await runCli(["audio", "BV1ABcsztEcY", "--no-split", "-o", "/tmp/audio"], runtime);

    expect(exitCode).toBe(0);
    expect(runtime.api.getAudioDownloadInfo).toHaveBeenCalledWith("BV1ABcsztEcY", credential);
    expect(runtime.audio.download).toHaveBeenCalledWith(
      expect.objectContaining({ bvid: "BV1ABcsztEcY" }),
      { outputDir: "/tmp/audio", segmentSeconds: 25, split: false },
    );
    expect(stdout.join("")).toContain("已保存音频");
  });
});
