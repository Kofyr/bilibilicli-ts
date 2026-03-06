# bilibili-cli-ts

一个基于 `Node.js + TypeScript` 的 Bilibili 命令行工具。

## 功能

- 认证：`auth status` / `auth login` / `auth logout`
- 个人信息：`me`
- 视频：`video show <BV|URL>`，支持 `--subtitle` / `--summary` / `--comments` / `--related` / `--json`
- 音频：`audio <BV|URL>`，支持 `-o <dir>` / `--segment <seconds>` / `--no-split`
- 用户：`user show <uid|name>`、`user videos <uid>`
- 搜索：`search users <keyword>`、`search videos <keyword>`
- 发现：`discover hot`、`discover rank`
- 互动：`interact like` / `interact coin` / `interact triple` / `interact unfollow`
- 时间线：`timeline feed` / `timeline mine` / `timeline post` / `timeline delete`
- 资料库：`library favorites`、`library following`、`library history`、`library watch-later`

## 开发

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

开发时可以直接通过 `pnpm dev` 运行 TypeScript 入口，不需要先构建。普通子命令可以直接跟在后面：

```bash
pnpm dev auth status
pnpm dev discover hot --json
pnpm dev video show BV1ABcsztEcY --json
pnpm dev audio BV1ABcsztEcY -o ./tmp/audio --no-split
```

如果要传入容易和 `pnpm` 自身参数混淆的选项，例如 `--help`，再使用 `--` 分隔：

```bash
pnpm dev -- --help
```

其中 `package.json` 里的 `dev` 实际执行的是 `tsx src/bin.ts`，所以上面的命令等价于：

```bash
tsx src/bin.ts --help
tsx src/bin.ts discover hot --json
```

构建完成后可直接运行：

```bash
node dist/bin.js --help
node dist/bin.js discover hot --json
node dist/bin.js video show BV1ABcsztEcY --json
```

## 认证

- 默认将凭证保存到 `~/.bilibili-cli/credential.json`
- 可以通过环境变量 `BILI_TS_CREDENTIAL_PATH` 覆盖保存位置
- `auth login` 使用终端二维码登录
- 需要登录的命令会优先使用本地保存的凭证；若本地没有可用凭证，会尝试通过 `chrome-cookies-secure` 读取本机 Chrome Cookie
- 自动导入已验证 **Google Chrome**
- macOS 首次读取时可能会弹出 Keychain 权限确认

## 音频

- `audio` 默认会先下载音轨，再用系统 `ffmpeg` 按 25 秒切成 16kHz 单声道 WAV；若只想保留完整音频，可使用 `--no-split`
- 使用 `audio` 的切分能力前需确保本机已安装 `ffmpeg`
