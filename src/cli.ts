import { readFile } from "node:fs/promises";

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

function formatDuration(value: unknown) {
  if (typeof value === "string") {
    if (value.includes(":")) {
      return value;
    }

    if (!value.trim()) {
      return "00:00";
    }
  }

  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remain = Math.floor(seconds % 60);
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function formatMonthDayTime(value: unknown) {
  const timestamp = Number(value ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "-";
  }

  const date = new Date(timestamp * 1000);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function getLevel(info: Record<string, any>) {
  return String(info.level_info?.current_level ?? info.level ?? "?");
}

function getCoinCount(info: Record<string, any>) {
  return Number(info.money ?? info.coins ?? 0);
}

function getVipLabel(info: Record<string, any>) {
  const vip = parseJsonObject(info.vip);
  if (vip.status !== 1) {
    return "";
  }

  return vip.type === 2 ? "大会员" : "小会员";
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
  return formatMonthDayTime(desc.timestamp ?? 0);
}

function extractFeedTitle(item: Record<string, any>) {
  const modules = parseJsonObject(item.modules);
  const major = parseJsonObject(modules.module_dynamic?.major);
  return cleanText(
    major.archive?.title
      ?? major.article?.title
      ?? "",
  );
}

function extractFeedAuthor(item: Record<string, any>) {
  const modules = parseJsonObject(item.modules);
  const author = parseJsonObject(modules.module_author);
  return cleanText(author.name ?? author.pub_text ?? "");
}

function extractFeedPubTime(item: Record<string, any>) {
  const modules = parseJsonObject(item.modules);
  const author = parseJsonObject(modules.module_author);
  return cleanText(author.pub_time ?? "");
}

function extractFeedStats(item: Record<string, any>) {
  const modules = parseJsonObject(item.modules);
  const stat = parseJsonObject(modules.module_stat);
  return {
    like: Number(stat.like?.count ?? 0),
    comment: Number(stat.comment?.count ?? 0),
  };
}

async function confirmAction(message: string) {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(`${message} [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function renderVideoInfo(io: CliRuntime["io"], info: Record<string, any>, extras: {
  subtitle?: string;
  summary?: string;
  comments?: Array<Record<string, any>>;
  related?: Array<Record<string, any>>;
}) {
  const ownerName = info.owner?.name ?? "";
  const ownerUid = info.owner?.mid ?? "";
  const lines = [
    `标题: ${cleanText(info.title)}`,
    `BV: ${info.bvid ?? ""}`,
    `UP: ${ownerUid ? `${ownerName} (UID: ${ownerUid})` : ownerName}`,
    `时长: ${formatDuration(info.duration)}`,
    `播放: ${formatCount(info.stat?.view)}`,
    `弹幕: ${formatCount(info.stat?.danmaku)}`,
    `点赞: ${formatCount(info.stat?.like)}`,
    `投币: ${formatCount(info.stat?.coin)}`,
    `收藏: ${formatCount(info.stat?.favorite)}`,
    `分享: ${formatCount(info.stat?.share)}`,
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
    const commentLines = extras.comments.map((comment) => `- ${comment.member?.uname ?? "匿名"} (👍 ${formatCount(comment.like)}): ${comment.content?.message ?? ""}`);
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
      const credential = await runtime.auth.requireCredential("read");
      const me = await runtime.api.getSelfInfo(credential);
      write(runtime.io, `已登录: ${getDisplayName(me)} (UID: ${me.mid ?? "unknown"})`);
    });

  auth
    .command("login")
    .description("二维码登录")
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

      const sign = String(me.sign ?? "").trim();
      const vipLabel = getVipLabel(me);

      write(
        runtime.io,
        [
          `昵称: ${getDisplayName(me)}`,
          `UID: ${me.mid ?? "unknown"}`,
          `等级: ${getLevel(me)}`,
          `硬币: ${getCoinCount(me)}`,
          vipLabel ? `会员: ${vipLabel}` : "",
          `粉丝: ${formatCount(relation.follower)}`,
          `关注: ${formatCount(relation.following)}`,
          sign ? `签名: ${sign}` : "",
        ].filter(Boolean).join("\n"),
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

  program
    .command("audio")
    .description("下载视频音频")
    .argument("<bvidOrUrl>", "BV 号或视频 URL")
    .option("-o, --output <dir>", "输出目录")
    .option("--segment <seconds>", "切片时长（秒）", "25")
    .option("--no-split", "仅下载完整音频，不切片")
    .action(async (bvidOrUrl, options) => {
      const credential = await runtime.auth.getCredential("optional");
      const bvid = extractBvid(String(bvidOrUrl));
      const info = await runtime.api.getAudioDownloadInfo(bvid, credential);
      const result = await runtime.audio.download(info, {
        outputDir: options.output,
        segmentSeconds: Number(options.segment),
        split: options.split,
      });

      if (result.split) {
        write(
          runtime.io,
          [
            `已切分音频: ${info.title} (${formatDuration(info.duration)})`,
            `输出目录: ${result.outputDir}`,
            `文件数: ${result.files.length}`,
          ].join("\n"),
        );
        return;
      }

      write(runtime.io, `已保存音频: ${result.files[0]}`);
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
      const relation = await runtime.api.getRelationStat(uid, credential);
      if (options.json) {
        toJson(runtime.io, { user_info: info, relation });
        return;
      }

      const sign = String(info.sign ?? "").trim();

      write(
        runtime.io,
        [
          `昵称: ${getDisplayName(info)}`,
          `UID: ${info.mid ?? uid}`,
          `等级: ${getLevel(info)}`,
          `粉丝: ${formatCount(relation.follower)}`,
          `关注: ${formatCount(relation.following)}`,
          sign ? `签名: ${sign}` : "",
        ].filter(Boolean).join("\n"),
      );
    });

  user
    .command("videos")
    .argument("<uidOrName>", "用户 UID 或昵称")
    .option("--page <page>", "页码", "1")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (uidOrName, options) => {
      const credential = await runtime.auth.getCredential("optional");
      const uid = await resolveUserId(runtime, String(uidOrName));
      const data = await runtime.api.getUserVideos(uid, { page: Number(options.page), pageSize: Number(options.max) }, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const page = Number(options.page);
      const pageSize = Number(options.max);
      const videos = toArray<Record<string, any>>(data?.list?.vlist);
      const rows = videos.map((item, index) => [
        1 + (page - 1) * pageSize + index,
        item.bvid ?? "",
        cleanText(item.title),
        formatDuration(item.length),
        formatCount(item.play),
      ]);
      write(runtime.io, toTable(["#", "BV", "标题", "时长", "播放"], rows));
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

      const rows = result.map((item: Record<string, any>) => [
        item.mid ?? "",
        cleanText(item.uname),
        formatCount(item.fans),
        item.videos ?? 0,
        cleanText(item.usign),
      ]);
      write(runtime.io, toTable(["UID", "昵称", "粉丝", "视频数", "签名"], rows));
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

      const rows = result.map((item: Record<string, unknown>) => [
        item.bvid ?? "",
        cleanText(item.title),
        cleanText(item.author),
        formatCount(item.play),
        cleanText(item.duration),
      ]);
      write(runtime.io, toTable(["BV", "标题", "UP", "播放", "时长"], rows));
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

      const page = Number(options.page);
      const max = Number(options.max);
      const rows = toArray<Record<string, any>>(data, "list").slice(0, max).map((item, index) => [
        1 + (page - 1) * max + index,
        item.bvid ?? "",
        cleanText(item.title),
        item.owner?.name ?? "",
        formatCount(item.stat?.view),
        formatCount(item.stat?.like),
      ]);
      write(runtime.io, toTable(["#", "BV", "标题", "UP", "播放", "点赞"], rows));
    });

  discover
    .command("rank")
    .option("--day <day>", "榜单周期", "3")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const data = await runtime.api.getRankVideos(Number(options.day), null);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const max = Number(options.max);
      const rows = toArray<Record<string, any>>(data, "list").slice(0, max).map((item, index) => [
        index + 1,
        item.bvid ?? "",
        cleanText(item.title),
        item.owner?.name ?? "",
        formatCount(item.stat?.view),
        item.score ?? "",
      ]);
      write(runtime.io, toTable(["#", "BV", "标题", "UP", "播放", "综合分"], rows));
    });

  const interact = program.command("interact").description("互动命令");
  interact
    .command("like")
    .argument("<bvidOrUrl>", "BV 号或视频 URL")
    .option("--undo", "取消点赞")
    .action(async (bvidOrUrl, options) => {
      const credential = await runtime.auth.requireCredential("write");
      const bvid = extractBvid(String(bvidOrUrl));
      await runtime.api.likeVideo(bvid, credential, Boolean(options.undo));
      write(runtime.io, `${options.undo ? "已取消点赞" : "已点赞"}: ${bvid}`);
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
    .option("--yes", "跳过确认")
    .option("--json", "输出 JSON")
    .action(async (uidInput, options) => {
      const credential = await runtime.auth.requireCredential("write");
      const uid = Number(uidInput);
      if (!options.yes) {
        const confirmed = await confirmAction(`确认取消关注 ${uid} 吗？`);
        if (!confirmed) {
          write(runtime.io, "已取消操作");
          return;
        }
      }

      const result = await runtime.api.unfollowUser(uid, credential);
      if (options.json) {
        toJson(runtime.io, result);
        return;
      }

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
      if (items.length === 0) {
        write(runtime.io, "暂无动态");
        return;
      }

      const blocks = items.slice(0, 15).map((item) => {
        const title = extractFeedTitle(item);
        const text = extractDynamicText(item);
        const stats = extractFeedStats(item);

        return [
          `ID: ${item.id_str ?? item.id ?? ""}`,
          `作者: ${extractFeedAuthor(item)}`,
          `时间: ${extractFeedPubTime(item) || "-"}`,
          title ? `标题: ${title}` : "",
          text ? `内容: ${text}` : "",
          `点赞: ${formatCount(stats.like)}  评论: ${formatCount(stats.comment)}`,
        ].filter(Boolean).join("\n");
      });

      write(runtime.io, blocks.join("\n\n"));

      const nextOffset = data?.next_offset ?? data?.offset;
      if (nextOffset) {
        write(runtime.io, `\n下一页 offset: ${nextOffset}`);
      }
    });

  timeline
    .command("mine")
    .option("--offset <offset>", "动态偏移量", "0")
    .option("--top", "包含置顶动态")
    .option("--max <count>", "数量", "20")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getMyDynamics(credential, Number(options.offset), Boolean(options.top));
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }

      const rows = toArray<Record<string, any>>(data, "cards").slice(0, Number(options.max)).map((item) => [
        extractDynamicId(item),
        extractDynamicTime(item),
        extractDynamicText(item),
      ]);
      write(runtime.io, toTable(["ID", "时间", "内容"], rows));

      const nextOffset = data?.next_offset ?? data?.offset;
      if (nextOffset && String(nextOffset) !== String(options.offset)) {
        write(runtime.io, `\n下一页 offset: ${nextOffset}`);
      }
    });

  timeline
    .command("post")
    .argument("[text]", "动态文本")
    .option("--from-file <path>", "从文件读取动态文本")
    .option("--json", "输出 JSON")
    .action(async (text, options) => {
      const credential = await runtime.auth.requireCredential("write");
      const content = options.fromFile ? (await readFile(String(options.fromFile), "utf8")).trim() : String(text ?? "").trim();
      if (!content) {
        throw new BiliCliError("动态文本不能为空");
      }

      const data = await runtime.api.postTextDynamic(content, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const dynamicId = data?.dynamic_id_str ?? data?.dyn_id_str ?? data?.dynamic_id ?? data?.dyn_id;
      write(runtime.io, dynamicId ? `已发布动态: ${dynamicId}` : "已发布动态");
    });

  timeline
    .command("delete")
    .argument("<id>", "动态 ID")
    .option("--yes", "跳过确认")
    .option("--json", "输出 JSON")
    .action(async (idInput, options) => {
      const credential = await runtime.auth.requireCredential("write");
      const dynamicId = String(idInput).trim();
      if (!/^\d+$/.test(dynamicId)) {
        throw new BiliCliError(`动态 ID 非法: ${idInput}`);
      }

      if (!options.yes) {
        const confirmed = await confirmAction(`确认删除动态 ${dynamicId} 吗？`);
        if (!confirmed) {
          write(runtime.io, "已取消删除");
          return;
        }
      }

      const result = await runtime.api.deleteDynamic(dynamicId, credential);
      if (options.json) {
        toJson(runtime.io, result);
        return;
      }

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
      const rows = toArray<Record<string, any>>(data, "medias").map((item) => [
        item.bvid ?? "",
        cleanText(item.title),
        item.upper?.name ?? "",
        formatDuration(item.duration),
      ]);
      write(runtime.io, toTable(["BV", "标题", "UP", "时长"], rows));
    });

  library
    .command("following")
    .option("--page <page>", "页码", "1")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getFollowing(Number(options.page), 20, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const page = Number(options.page);
      const rows = toArray<Record<string, any>>(data, "list").map((item, index) => [
        1 + (page - 1) * 20 + index,
        item.mid ?? "",
        cleanText(item.uname),
        formatCount(item.fans),
        cleanText(item.sign),
      ]);
      write(runtime.io, toTable(["#", "UID", "昵称", "粉丝", "签名"], rows));
    });

  library
    .command("history")
    .option("--page <page>", "页码", "1")
    .option("--max <count>", "数量", "30")
    .option("--json", "输出 JSON")
    .action(async (options) => {
      const credential = await runtime.auth.requireCredential("read");
      const data = await runtime.api.getHistory({ page: Number(options.page), pageSize: Number(options.max) }, credential);
      if (options.json) {
        toJson(runtime.io, data);
        return;
      }
      const items = Array.isArray(data) ? data : toArray<Record<string, any>>(data, "list");
      const rows = items.slice(0, Number(options.max)).map((item) => [
        item.history?.bvid ?? item.bvid ?? "",
        cleanText(item.title ?? item.name),
        cleanText(item.owner?.name ?? item.author_name ?? item.author),
        formatMonthDayTime(item.view_at ?? item.history?.view_at),
      ]);
      write(runtime.io, toTable(["BV", "标题", "UP", "观看时间"], rows));
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
      const rows = toArray<Record<string, any>>(data, "list").map((item) => [
        item.bvid ?? "",
        cleanText(item.title),
        cleanText(item.owner?.name ?? item.author),
        formatDuration(item.duration),
      ]);
      write(runtime.io, toTable(["BV", "标题", "UP", "时长"], rows));
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
