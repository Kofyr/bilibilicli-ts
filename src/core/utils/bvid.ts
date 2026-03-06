import { BiliCliError } from "../errors.js";

const BVID_PATTERN = /BV[0-9A-Za-z]{10}/;

export function extractBvid(input: string): string {
  const match = input.match(BVID_PATTERN);
  if (!match) {
    throw new BiliCliError(`无法从输入中提取 BV 号: ${input}`);
  }

  return match[0];
}
