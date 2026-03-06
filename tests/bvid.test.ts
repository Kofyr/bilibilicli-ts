import { describe, expect, it } from "vitest";

import { extractBvid } from "../src/core/utils/bvid.js";

describe("extractBvid", () => {
  it("returns a raw BV id as-is", () => {
    expect(extractBvid("BV1ABcsztEcY")).toBe("BV1ABcsztEcY");
  });

  it("extracts a BV id from a bilibili url", () => {
    expect(extractBvid("https://www.bilibili.com/video/BV1ABcsztEcY/?spm_id_from=333.1007")).toBe("BV1ABcsztEcY");
  });

  it("throws on invalid input", () => {
    expect(() => extractBvid("not-a-video")).toThrow(/BV/);
  });
});
