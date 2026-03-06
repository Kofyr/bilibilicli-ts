import { AuthenticationError, BiliCliError } from "./errors.js";
import type { BiliCredential, HttpAdapter, RequestOptions } from "./types.js";

export interface UserVideosOptions {
  page: number;
  pageSize: number;
}

function withVideoReferer(bvid: string, credential?: BiliCredential | null): RequestOptions {
  return {
    credential,
    referer: `https://www.bilibili.com/video/${bvid}/`,
  };
}

function normalizeProtocolUrl(url: string) {
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  return url;
}

function parseSpacePageProfile(uid: number, html: string) {
  const titleMatch = html.match(/<title>([^<]+?)的个人空间/);
  const descriptionMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);

  const name = titleMatch?.[1]?.trim() || String(uid);
  const sign = descriptionMatch?.[1]?.trim() || "";

  return {
    mid: uid,
    name,
    uname: name,
    sign,
  };
}

export class BiliClient {
  constructor(private readonly http: HttpAdapter) {}

  async validateCredential(credential: BiliCredential, mode: "read" | "write") {
    try {
      const nav = await this.http.getJson("/x/web-interface/nav", undefined, { credential });
      const isLogin = Boolean(nav?.isLogin);
      if (!isLogin) {
        return "invalid" as const;
      }
      if (mode === "write" && !credential.cookies.bili_jct) {
        return "invalid" as const;
      }
      return "valid" as const;
    } catch {
      return "indeterminate" as const;
    }
  }

  async getSelfInfo(credential: BiliCredential) {
    return this.http.getJson("/x/web-interface/nav", undefined, { credential });
  }

  async getRelationStat(uid: number, credential?: BiliCredential | null) {
    return this.http.getJson("/x/relation/stat", { vmid: uid }, { credential });
  }

  async getUserInfo(uid: number, credential?: BiliCredential | null) {
    try {
      return await this.http.getSignedJson(
        "/x/space/wbi/acc/info",
        { mid: uid, token: "", platform: "web", web_location: "1550101" },
        {
          credential,
          referer: `https://space.bilibili.com/${uid}`,
          headers: {
            Origin: "https://space.bilibili.com",
          },
        },
      );
    } catch (error) {
      if (!(error instanceof Error) || !("responseCode" in error) || (error as { responseCode?: number }).responseCode !== -352) {
        throw error;
      }

      const html = await this.http.getText(`https://space.bilibili.com/${uid}`, {
        referer: "https://www.bilibili.com/",
        headers: {
          Origin: "https://space.bilibili.com",
        },
      });
      return parseSpacePageProfile(uid, html);
    }
  }

  async getUserVideos(uid: number, options: UserVideosOptions, credential?: BiliCredential | null) {
    return this.http.getSignedJson(
      "/x/space/wbi/arc/search",
      {
        mid: uid,
        pn: options.page,
        ps: options.pageSize,
        tid: 0,
        keyword: "",
        order: "pubdate",
        platform: "web",
        web_location: "1550101",
        order_avoided: "true",
        dm_img_list: "[]",
        dm_img_str: "",
        dm_cover_img_str: "",
        dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
      },
      {
        credential,
        referer: `https://space.bilibili.com/${uid}`,
        headers: {
          Origin: "https://space.bilibili.com",
          "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        },
      },
    );
  }

  async searchUsers(keyword: string, page = 1, pageSize = 20, credential?: BiliCredential | null) {
    const data = await this.http.getJson(
      "/x/web-interface/search/type",
      { search_type: "bili_user", keyword, page, page_size: pageSize },
      { credential },
    );
    return data?.result ?? [];
  }

  async searchVideos(keyword: string, page = 1, pageSize = 20, credential?: BiliCredential | null) {
    const data = await this.http.getJson(
      "/x/web-interface/search/type",
      { search_type: "video", keyword, page, page_size: pageSize },
      { credential },
    );
    return data?.result ?? [];
  }

  async getVideoInfo(bvid: string, credential?: BiliCredential | null) {
    return this.http.getJson("/x/web-interface/view", { bvid }, withVideoReferer(bvid, credential));
  }

  async getVideoSummary(bvid: string, credential?: BiliCredential | null) {
    const view = await this.getVideoInfo(bvid, credential);
    const cid = view?.pages?.[0]?.cid;
    if (!cid) {
      return { segments: [], text: "" };
    }

    const player = await this.http.getJson("/x/player/v2", { bvid, cid }, withVideoReferer(bvid, credential));
    const segments = Array.isArray(player?.view_points) ? player.view_points : [];
    const text = segments
      .map((segment: Record<string, unknown>) => String(segment.content ?? "").trim())
      .filter(Boolean)
      .join("\n");

    return { segments, text };
  }

  async getVideoSubtitle(bvid: string, credential?: BiliCredential | null) {
    const view = await this.getVideoInfo(bvid, credential);
    const cid = view?.pages?.[0]?.cid;
    if (!cid) {
      return { items: [], text: "" };
    }

    const player = await this.http.getJson("/x/player/v2", { bvid, cid }, withVideoReferer(bvid, credential));
    const subtitleUrl = player?.subtitle?.subtitles?.[0]?.subtitle_url;
    if (!subtitleUrl) {
      return { items: [], text: "" };
    }

    const subtitle = await this.http.getJson(normalizeProtocolUrl(subtitleUrl), undefined, withVideoReferer(bvid, credential));
    const items = Array.isArray(subtitle?.body) ? subtitle.body : [];
    const text = items
      .map((item: Record<string, unknown>) => String(item.content ?? "").trim())
      .filter(Boolean)
      .join("\n");

    return { items, text };
  }

  async getVideoComments(bvid: string, page = 1, pageSize = 20, credential?: BiliCredential | null) {
    const view = await this.getVideoInfo(bvid, credential);
    const aid = view?.aid;
    if (!aid) {
      throw new BiliCliError(`视频 ${bvid} 缺少 aid，无法获取评论`);
    }

    return this.http.getJson(
      "/x/v2/reply",
      { oid: aid, type: 1, pn: page, ps: pageSize, sort: 2 },
      withVideoReferer(bvid, credential),
    );
  }

  async getRelatedVideos(bvid: string, credential?: BiliCredential | null) {
    return this.http.getJson("/x/web-interface/archive/related", { bvid }, withVideoReferer(bvid, credential));
  }

  async getHotVideos(page = 1, pageSize = 20, credential?: BiliCredential | null) {
    return this.http.getJson("/x/web-interface/popular", { pn: page, ps: pageSize }, { credential });
  }

  async getRankVideos(day = 3, credential?: BiliCredential | null) {
    return this.http.getJson("/x/web-interface/ranking/v2", { rid: 0, type: "all", day }, { credential });
  }

  async getFavoriteFolders(credential: BiliCredential) {
    const me = await this.getSelfInfo(credential);
    const uid = Number(me?.mid);
    if (!uid) {
      throw new AuthenticationError("当前登录信息中缺少 UID，无法获取收藏夹");
    }

    return this.http.getJson("/x/v3/fav/folder/created/list-all", { up_mid: uid, type: 2 }, { credential });
  }

  async getFavoriteItems(folderId: number, page = 1, pageSize = 20, credential?: BiliCredential | null) {
    return this.http.getJson(
      "/x/v3/fav/resource/list",
      { media_id: folderId, pn: page, ps: pageSize, platform: "web" },
      { credential },
    );
  }

  async getFollowing(page = 1, pageSize = 20, credential?: BiliCredential | null) {
    if (!credential) {
      throw new AuthenticationError("获取关注列表需要登录");
    }

    const me = await this.getSelfInfo(credential);
    const uid = Number(me?.mid);
    if (!uid) {
      throw new AuthenticationError("当前登录信息中缺少 UID，无法获取关注列表");
    }

    return this.http.getJson("/x/relation/followings", { vmid: uid, pn: page, ps: pageSize }, { credential });
  }

  async getHistory(pageSize = 20, credential?: BiliCredential | null) {
    if (!credential) {
      throw new AuthenticationError("获取观看历史需要登录");
    }

    return this.http.getJson("/x/web-interface/history/cursor", { ps: pageSize }, { credential });
  }

  async getWatchLater(credential?: BiliCredential | null) {
    if (!credential) {
      throw new AuthenticationError("获取稍后再看需要登录");
    }

    return this.http.getJson("/x/v2/history/toview/web", undefined, { credential });
  }

  async getFeed(offset: string | undefined, credential?: BiliCredential | null) {
    if (!credential) {
      throw new AuthenticationError("获取动态时间线需要登录");
    }

    return this.http.getJson("/x/polymer/web-dynamic/v1/feed/all", { type: "all", offset }, { credential });
  }
}
