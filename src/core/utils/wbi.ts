import { createHash } from "node:crypto";

const MIXIN_KEY_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function getMixinKey(value: string) {
  let mixed = "";
  for (const index of MIXIN_KEY_TABLE) {
    mixed += value[index] ?? "";
  }
  return mixed.slice(0, 32);
}

export function extractWbiKeys(navData: { wbi_img?: { img_url?: string; sub_url?: string } }) {
  const imgUrl = navData.wbi_img?.img_url ?? "";
  const subUrl = navData.wbi_img?.sub_url ?? "";

  const imgKey = imgUrl.slice(imgUrl.lastIndexOf("/") + 1, imgUrl.lastIndexOf("."));
  const subKey = subUrl.slice(subUrl.lastIndexOf("/") + 1, subUrl.lastIndexOf("."));

  return { imgKey, subKey };
}

export function signWbiQuery(
  params: Record<string, string | number | boolean | undefined>,
  keys: { imgKey: string; subKey: string },
): string {
  const mixinKey = getMixinKey(`${keys.imgKey}${keys.subKey}`);
  const filtered = Object.entries({ ...params, wts: Math.round(Date.now() / 1000) })
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, String(value).replace(/[!'()*]/g, "")]);

  const search = new URLSearchParams(filtered);
  search.set("w_rid", md5(`${search.toString()}${mixinKey}`));
  return search.toString();
}
