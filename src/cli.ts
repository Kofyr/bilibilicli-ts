import Table from "cli-table3";
import { Command, CommanderError } from "commander";

import { AuthenticationError, BiliCliError } from "./core/errors.js";
import { extractBvid } from "./core/utils/bvid.js";
import type { BiliCredential } from "./core/types.js";
import type { CliRuntime } from "./runtime.js";

function write(io: CliRuntime["io"], value = "") {
  io.write(`${value}\n`);
}

function writeError(io: CliRuntime["io"], value = "") {
  io.writeError(`${value}\n`);
}

function toJson(io: CliRuntime["io"], value: unknown) {
  io.write(`${JSON.stringify(value, null, 2)}\n`);
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, "").trim();
}

function formatCount(value: unknown) {
  const count = Number(value ?? 0);
  if (count >= 100_000_000) {
    return `${(count / 100_000_000).toFixed(1)}亿`;
  }
  if (count >= 10_000) {
    return `${(count / 10_000).toFixed(1)}万`;
  }
  return String(count);
}

function toTable(head: string[], rows: Array<Array<string | number>>) {
  const table = new Table({ head });
  rows.forEach((row) => table.push(row));
  return table.toString();
}

function toArray<T = Record<string, any>>(value: unknown, key?: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (key && value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, unknown>)[key] as T[];
  }
  return [];
}

async function resolveUserId(runtime: CliRuntime, input: string) {
  if (/^\d+$/.test(input)) {
    return Number(input);
  }

  const users = await runtime.api.searchUsers(input, 1, 5, null);
  const first = users[0];
  if (!first?.mid) {
    throw new BiliCliError(`未找到用户：${input}`);
  }
  return Number(first.mid);
}

function getDisplayName(info: Record<string, unknown>) {
  return String(info.uname ?? info.name ?? "unknown");
}

function parseJsonObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  if (typeof value !== "string") {
    return {} as Record<string, any>;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch {
    return {} as Record<string, any>;
  }

  return {} as Record<string, any>;
}

function extractDynamicId(item: Record<string, any>) {
  const desc = parseJsonObject(item.desc);
  return String(desc.dynamic_id_str ?? item.id_str ?? desc.dynamic_id ?? item.id ?? "");
}

function extractDynamicText(item: Record<string, any>) {
  const modules = parseJsonObject(item.modules);
  const card = parseJsonObject(item.card);
  return cleanText(
    modules.module_dynamic?.desc?.text
      ?? card.item?.content
      ?? card.item?.description
      ?? card.title
      ?? card.description
      ?? card.dynamic
      ?? "",
  );
}

function extractDynamicTime(item: Record<string, any>) {
  const desc = parseJsonObject(item.desc);
  const timestamp = Number(desc.timestamp ?? 0);
  if (!timestamp) {
    return "-";
  }

  return new Date(timestamp * 1000).toISOString().slice(5, 16).replace("T", " ");
}

function renderVideoInfo(io: CliRuntime["io"], info: Record<string, any>, extras: {
  subtitle?: string;
  summary?: string;
  comments?: Array<Record<string, any>>;
  related?: Array<Record<string, any>>;
}) {
  const lines = [
    `标题: ${cleanText(info.title)}`,
    `BV: ${info.bvid ?? ""}`,
    `UP: ${info.owner?.name ?? ""}`,
    `播放: ${formatCount(info.stat?.view)}`,
    `点赞: ${formatCount(info.stat?.like)}`,
    `链接: https://www.bilibili.com/video/${info.bvid ?? ""}`,
  ];

  if (info.desc) {
    lines.push(`简介: ${String(info.desc).trim()}`);
  }

  write(io, lines.join("\n"));

  if (extras.subtitle) {
    write(io, `\n字幕:\n${extras.subtitle}`);
  }
  if (extras.summary) {
    write(io, `\n总结:\n${extras.summary}`);
  }
  if (extras.comments && extras.comments.length > 0) {
    const commentLines = extras.comments.map((comment) => `- ${comment.member?.uname ?? "匿名"}: ${comment.content?.message ?? ""}`);
    write(io, `\n评论:\n${commentLines.join("\n")}`);
  }
  if (extras.related && extras.related.length > 0) {
    const rows = extras.related.slice(0, 10).map((item) => [
      item.bvid ?? "",
      cleanText(item.title),
      item.owner?.name ?? "",
      formatCount(item.stat?.view),
    ]);
    write(io, `\n相关推荐:\n${toTable(["BV", "标题", "UP", "播放"], rows)}`);
  }
}

export function createCli(runtime: CliRuntime) {
  const program = new Command();
  program
    .name("bili-ts")
    .description("Bilibili CLI implemented in TypeScript")
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (value) => runtime.io.write(value),
      writeErr: (value) => runtime.io.writeError(value),
    });

  program.option("-v, --verbose", "show verbose logs");

  const auth = program.command("auth").description("认证相关命令");

  auth
    .command("status")
    .description("检查登录状态")
    .action(async () => {
      const credential = await runtime.auth.getCredential("read");
      if (!credential) {
        throw new AuthenticationError("未登录，请先执行 bili-ts auth login");
      }

      const me = await runtime.api.getSelfInfo(credential);
      write(runtime.io, `已登录: ${getDisplayName(me)} (UID: ${me.mid ?? "unknown"})`);
    });

  auth
    .command("login")
    .description("浏览器 Cookie 或二维码登录")
    .action(async () => {
      const result = await runtime.auth.login();
      write(runtime.io, `登录成功，来源: ${result.method}`);
    });

  auth
    .command("logout")
    .description("注销并清除本地凭证")
    .action(async () => {
      await runtime.auth.logout();
      write(runtime.io, "已清除本地凭证");
    });

  program
    .command("me")
    .description("显示当前登录账号")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const me = await runtime.api.getSelfInfo(credential);
      const relation = await runtime.api.getRelationStat(Number(me.mid), credential);
      if (options.json) {
        toJson(runtime.io, { info: me, relation });
        return;
      }

      write(
        runtime.io,
        [
          `昵称: ${getDisplayName(me)}`,
          `UID: ${me.mid ?? "unknown"}`,
          `硬币: ${me.money ?? me.coins ?? 0}`,
          `粉丝: ${formatCount(relation.follower)}`,
          `关注: ${formatCount(relation.following)}`,
        ].join("\n"),
      );
    });

  const video = program.command("video").description("视频相关命令");
  video
    .command("show")
    .argument("<bvidOrUrl>", "BV 号或视频 URL")
    .option("--subtitle", "加载字幕")
    .option("--summary", "加载视频总结")
    .option("--comments", "加载热门评论")
    .option("--related", "加载相关推荐")
    .option("--json", "输出 JSON")
    .description("显示视频详情")
    .action(async (bvidOrUrl, options) => {
      const credential = await runtime.auth.getCredential("optional");
      const bvid = extractBvid(String(bvidOrUrl));
      const info = await runtime.api.getVideoInfo(bvid, credential);

      const subtitle = options.subtitle ? await runtime.api.getVideoSubtitle(bvid, credential) : null;
      const summary = options.summary ? await runtime.api.getVideoSummary(bvid, credential) : null;
      const comments = options.comments ? await runtime.api.getVideoComments(bvid, 1, 10, credential) : null;
      const related = options.related ? await runtime.api.getRelatedVideos(bvid, credential) : null;

      if (options.json) {
        toJson(runtime.io, {
          info,
          subtitle,
          summary,
          comments,
          related,
        });
        return;
      }

      renderVideoInfo(runtime.io, info, {
        subtitle: subtitle?.text,
        summary: summary?.text,
        comments: comments?.replies ?? [],
        related: Array.isArray(related) ? related : [],
      });
    });

  const user = program.command("user").description("用户相关命令");
  user
    .command("show")
    .argument("<uidOrName>", "UID 或昵称")
    .option("--json", "输出 JSON")
    .action(async (uidOrName, options) => {
      const credential = await runtime.auth.getCredential("optional");
      const uid = await resolveUserId(runtime, String(uidOrName));
      const info = await runtime.api.getUserInfo(uid, credential);
      if (options.json) {
        toJson(runtime.io, info);
        return;
      }

      write(
        runtime.io,
        [
          `昵称: ${getDisplayName(info)}`,
          `UID: ${info.mid ?? uid}`,
          `签名: ${String(info.sign ?? "").trim()}`,
        ].join("\n"),
      );
    });

  user
    .command("videos")
    .argument("<uid>", "用户 UID")
    .option("--page <page>", "页码", "1")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (uidInput, options) => {
      const credential = await runtime.auth.getCredential("optional");
      const data = await runtime.api.getUserVideos(Number(uidInput), { page: Number(options.page), pageSize: Number(options.max) }, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const videos = toArray<Record<string, any>>(data?.list?.vlist);
      const rows = videos.map((item) => [item.bvid ?? "", cleanText(item.title), formatCount(item.play)]);
      write(runtime.io, toTable(["BV", "标题", "播放"], rows));
    });

  const search = program.command("search").description("搜索相关命令");
  search
    .command("users")
    .argument("<keyword>", "搜索关键词")
    .option("--page <page>", "页码", "1")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (keyword, options) => {
      const result = await runtime.api.searchUsers(String(keyword), Number(options.page), Number(options.max), null);
      if (options.json) {
        toJson(runtime.io, result);
        return;
      }

      const rows = result.map((item: Record<string, unknown>) => [item.mid ?? "", cleanText(item.uname), formatCount(item.fans)]);
      write(runtime.io, toTable(["UID", "昵称", "粉丝"], rows));
    });

  search
    .command("videos")
    .argument("<keyword>", "搜索关键词")
    .option("--page <page>", "页码", "1")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (keyword, options) => {
      const result = await runtime.api.searchVideos(String(keyword), Number(options.page), Number(options.max), null);
      if (options.json) {
        toJson(runtime.io, result);
        return;
      }

      const rows = result.map((item: Record<string, unknown>) => [item.bvid ?? "", cleanText(item.title), cleanText(item.author), formatCount(item.play)]);
      write(runtime.io, toTable(["BV", "标题", "UP", "播放"], rows));
    });

  const discover = program.command("discover").description("发现页命令");
  discover
    .command("hot")
    .option("--page <page>", "页码", "1")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const data = await runtime.api.getHotVideos(Number(options.page), Number(options.max), null);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const rows = toArray<Record<string, any>>(data, "list").map((item) => [
        item.bvid ?? "",
        cleanText(item.title),
        item.owner?.name ?? "",
        formatCount(item.stat?.view),
      ]);
      write(runtime.io, toTable(["BV", "标题", "UP", "播放"], rows));
    });

  discover
    .command("rank")
    .option("--day <day>", "榜单周期", "3")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const data = await runtime.api.getRankVideos(Number(options.day), null);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const rows = toArray<Record<string, any>>(data, "list").map((item) => [
        item.bvid ?? "",
        cleanText(item.title),
        item.owner?.name ?? "",
        formatCount(item.stat?.view),
      ]);
      write(runtime.io, toTable(["BV", "标题", "UP", "播放"], rows));
    });

  const interact = program.command("interact").description("互动命令");
  interact
    .command("like")
    .argument("<bvidOrUrl>", "BV 号或视频 URL")
    .action(async (bvidOrUrl) => {
      const credential = await runtime.auth.requireCredential("write");
      const bvid = extractBvid(String(bvidOrUrl));
      await runtime.api.likeVideo(bvid, credential);
      write(runtime.io, `已点赞: ${bvid}`);
    });

  interact
    .command("coin")
    .argument("<bvidOrUrl>", "BV 号或视频 URL")
    .option("--count <count>", "投币数量", "1")
    .action(async (bvidOrUrl, options) => {
      const credential = await runtime.auth.requireCredential("write");
      const bvid = extractBvid(String(bvidOrUrl));
      const count = Number(options.count);
      await runtime.api.coinVideo(bvid, credential, count);
      write(runtime.io, `已投 ${count} 枚硬币: ${bvid}`);
    });

  interact
    .command("triple")
    .argument("<bvidOrUrl>", "BV 号或视频 URL")
    .action(async (bvidOrUrl) => {
      const credential = await runtime.auth.requireCredential("write");
      const bvid = extractBvid(String(bvidOrUrl));
      await runtime.api.tripleVideo(bvid, credential);
      write(runtime.io, `一键三连成功: ${bvid}`);
    });

  interact
    .command("unfollow")
    .argument("<uid>", "用户 UID")
    .action(async (uidInput) => {
      const credential = await runtime.auth.requireCredential("write");
      const uid = Number(uidInput);
      await runtime.api.unfollowUser(uid, credential);
      write(runtime.io, `已取消关注: ${uid}`);
    });

  const timeline = program.command("timeline").description("时间线命令");
  timeline
    .command("feed")
    .option("--offset <offset>", "动态游标")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getFeed(options.offset, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const items = toArray<Record<string, any>>(data, "items");
      const rows = items.map((item) => [
        item.id_str ?? item.id ?? "",
        cleanText(item.modules?.module_author?.name ?? item.modules?.module_author?.pub_text ?? ""),
        cleanText(item.modules?.module_dynamic?.desc?.text ?? ""),
      ]);
      write(runtime.io, toTable(["ID", "作者", "内容"], rows));
    });

  timeline
    .command("mine")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getMyDynamics(credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const rows = toArray<Record<string, any>>(data, "cards").map((item) => [
        extractDynamicId(item),
        extractDynamicTime(item),
        extractDynamicText(item),
      ]);
      write(runtime.io, toTable(["ID", "时间", "内容"], rows));
    });

  timeline
    .command("post")
    .argument("<text>", "动态文本")
    .action(async (text) => {
      const credential = await runtime.auth.requireCredential("write");
      const content = String(text).trim();
      if (!content) {
        throw new BiliCliError("动态文本不能为空");
      }

      const data = await runtime.api.postTextDynamic(content, credential);
      const dynamicId = data?.dynamic_id_str ?? data?.dyn_id_str ?? data?.dynamic_id ?? data?.dyn_id;
      write(runtime.io, dynamicId ? `已发布动态: ${dynamicId}` : "已发布动态");
    });

  timeline
    .command("delete")
    .argument("<id>", "动态 ID")
    .action(async (idInput) => {
      const credential = await runtime.auth.requireCredential("write");
      const dynamicId = String(idInput).trim();
      if (!/^\d+$/.test(dynamicId)) {
        throw new BiliCliError(`动态 ID 非法: ${idInput}`);
      }

      await runtime.api.deleteDynamic(dynamicId, credential);
      write(runtime.io, `已删除动态: ${dynamicId}`);
    });

  const library = program.command("library").description("收藏与历史");
  library
    .command("favorites")
    .argument("[folderId]", "收藏夹 ID")
    .option("--page <page>", "页码", "1")
    .option("--json", "输出 JSON")
    .action(async (folderId, options) => {
      const credential = await runtime.auth.requireCredential("read");
      if (!folderId) {
        const data = await runtime.api.getFavoriteFolders(credential);
        if (options.json) {
          toJson(runtime.io, data);
          return;
        }
        const rows = toArray<Record<string, any>>(data, "list").map((item) => [item.id ?? item.fid ?? "", cleanText(item.title), item.media_count ?? 0]);
        write(runtime.io, toTable(["ID", "名称", "数量"], rows));
        return;
      }

      const data = await runtime.api.getFavoriteItems(Number(folderId), Number(options.page), 20, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const rows = toArray<Record<string, any>>(data, "medias").map((item) => [item.bvid ?? "", cleanText(item.title), item.upper?.name ?? ""]);
      write(runtime.io, toTable(["BV", "标题", "UP"], rows));
    });

  library
    .command("following")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getFollowing(1, 20, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const rows = toArray<Record<string, any>>(data, "list").map((item) => [item.mid ?? "", cleanText(item.uname), formatCount(item.fans)]);
      write(runtime.io, toTable(["UID", "昵称", "粉丝"], rows));
    });

  library
    .command("history")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getHistory(20, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const rows = toArray<Record<string, any>>(data, "list").map((item) => [item.history?.bvid ?? item.bvid ?? "", cleanText(item.title), cleanText(item.author_name ?? item.author)]);
      write(runtime.io, toTable(["BV", "标题", "UP"], rows));
    });

  library
    .command("watch-later")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getWatchLater(credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const rows = toArray<Record<string, any>>(data, "list").map((item) => [item.bvid ?? "", cleanText(item.title), cleanText(item.owner?.name ?? item.author)]);
      write(runtime.io, toTable(["BV", "标题", "UP"], rows));
    });

  return program;
}

export async function runCli(args: string[], runtime: CliRuntime) {
  const program = createCli(runtime);

  try {
    await program.parseAsync(args, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AuthenticationError || error instanceof BiliCliError || error instanceof Error) {
      writeError(runtime.io, message);
      return 1;
    }

    writeError(runtime.io, String(error));
    return 1;
  }
}
