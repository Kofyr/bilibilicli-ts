import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioService } from "../src/core/audio.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "bili-ts-audio-"));
  tempDirs.push(dir);
  return dir;
}

describe("AudioService", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("downloads the full audio file and creates the output directory", async () => {
    const outputRoot = await makeTempDir();
    const service = new AudioService({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(Uint8Array.from([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-length": "4" },
        }),
      ),
      execFileImpl: vi.fn(),
    });

    const result = await service.download({
      bvid: "BV1ABcsztEcY",
      title: "测试视频",
      duration: 120,
      url: "https://example.com/audio.m4s",
    }, {
      outputDir: join(outputRoot, "nested", "audio"),
      split: false,
      segmentSeconds: 25,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatch(/测试视频\.m4a$/);
    await expect(readFile(result.files[0])).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("downloads then splits audio into ffmpeg segments", async () => {
    const outputDir = await makeTempDir();
    const execFileImpl = vi.fn(async (_command: string, args: string[]) => {
      const pattern = args.at(-1) ?? "";
      await writeFile(pattern.replace("%03d", "000"), "seg0");
      await writeFile(pattern.replace("%03d", "001"), "seg1");
    });
    const service = new AudioService({
      fetchImpl: vi.fn().mockResolvedValue(new Response(Uint8Array.from([1, 2, 3]), { status: 200 })),
      execFileImpl,
    });

    const result = await service.download({
      bvid: "BV1ABcsztEcY",
      title: "测试视频",
      duration: 120,
      url: "https://example.com/audio.m4s",
    }, {
      outputDir,
      split: true,
      segmentSeconds: 25,
    });

    expect(execFileImpl).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-segment_time", "25"]));
    expect(result.files).toEqual([
      join(outputDir, "seg_000.wav"),
      join(outputDir, "seg_001.wav"),
    ]);
  });

  it("raises a clear ffmpeg error when splitting is requested without ffmpeg", async () => {
    const outputDir = await makeTempDir();
    const service = new AudioService({
      fetchImpl: vi.fn().mockResolvedValue(new Response(Uint8Array.from([1, 2, 3]), { status: 200 })),
      execFileImpl: vi.fn().mockRejectedValue(Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" })),
    });

    await expect(service.download({
      bvid: "BV1ABcsztEcY",
      title: "测试视频",
      duration: 120,
      url: "https://example.com/audio.m4s",
    }, {
      outputDir,
      split: true,
      segmentSeconds: 25,
    })).rejects.toThrow("未找到 ffmpeg");
  });
});
