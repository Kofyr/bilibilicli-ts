import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { BiliCliError } from "./errors.js";

const execFileAsync = promisify(execFile);
const DOWNLOAD_HEADERS = {
  Referer: "https://www.bilibili.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

export interface AudioDownloadInfo {
  bvid: string;
  title: string;
  duration: number;
  url: string;
}

export interface AudioDownloadOptions {
  outputDir?: string;
  split?: boolean;
  segmentSeconds?: number;
}

export interface AudioDownloadResult {
  outputDir: string;
  files: string[];
  downloadedBytes: number;
  title: string;
  duration: number;
  split: boolean;
}

export interface AudioServiceOptions {
  fetchImpl?: typeof fetch;
  execFileImpl?: (command: string, args: string[]) => Promise<void>;
  tempRoot?: () => string;
}

function sanitizeTitle(title: string) {
  const sanitized = title
    .replace(/[<>:"/\\|?*]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");
  return sanitized.slice(0, 120) || "audio";
}

async function defaultExecFileImpl(command: string, args: string[]) {
  await execFileAsync(command, args);
}

export class AudioService {
  private readonly fetchImpl: typeof fetch;
  private readonly execFileImpl: (command: string, args: string[]) => Promise<void>;
  private readonly tempRoot: () => string;

  constructor(options: AudioServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.execFileImpl = options.execFileImpl ?? defaultExecFileImpl;
    this.tempRoot = options.tempRoot ?? (() => join(tmpdir(), "bilibili-cli"));
  }

  async download(info: AudioDownloadInfo, options: AudioDownloadOptions = {}): Promise<AudioDownloadResult> {
    const outputDir = options.outputDir ?? join(this.tempRoot(), sanitizeTitle(info.title));
    const split = options.split ?? true;
    const segmentSeconds = options.segmentSeconds ?? 25;

    if (segmentSeconds <= 0) {
      throw new BiliCliError("音频切分时长必须大于 0");
    }

    await mkdir(outputDir, { recursive: true });

    if (!split) {
      const outputFile = join(outputDir, `${sanitizeTitle(info.title)}.m4a`);
      const downloadedBytes = await this.downloadFile(info.url, outputFile);
      return {
        outputDir,
        files: [outputFile],
        downloadedBytes,
        title: info.title,
        duration: info.duration,
        split: false,
      };
    }

    const rawFile = join(outputDir, "_raw.m4a");
    const downloadedBytes = await this.downloadFile(info.url, rawFile);
    try {
      await this.splitAudio(rawFile, outputDir, segmentSeconds);
      const files = (await readdir(outputDir))
        .filter((file) => file.startsWith("seg_") && file.endsWith(".wav"))
        .sort()
        .map((file) => join(outputDir, file));

      return {
        outputDir,
        files,
        downloadedBytes,
        title: info.title,
        duration: info.duration,
        split: true,
      };
    } finally {
      await rm(rawFile, { force: true });
    }
  }

  private async downloadFile(url: string, outputPath: string) {
    const response = await this.fetchImpl(url, {
      headers: DOWNLOAD_HEADERS,
    });
    if (!response.ok) {
      throw new BiliCliError(`音频下载失败: HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new BiliCliError("音频下载失败: 响应体为空");
    }

    await mkdir(dirname(outputPath), { recursive: true });
    const body = Readable.fromWeb(response.body as any);
    await pipeline(body, createWriteStream(outputPath));
    const size = response.headers.get("content-length");
    if (size) {
      return Number(size);
    }

    return (await stat(outputPath)).size;
  }

  private async splitAudio(inputPath: string, outputDir: string, segmentSeconds: number) {
    const outputPattern = join(outputDir, "seg_%03d.wav");

    try {
      await this.execFileImpl("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "segment",
        "-segment_time",
        String(segmentSeconds),
        outputPattern,
      ]);
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
        throw new BiliCliError("未找到 ffmpeg，请先安装 ffmpeg 后再使用音频切分");
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new BiliCliError(`音频切分失败: ${message}`);
    }
  }
}
