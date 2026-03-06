# bilibili-cli-ts

一个基于 `Node.js + TypeScript` 的 Bilibili 命令行工具。

## 当前能力

- 认证：`auth status` / `auth login` / `auth logout`
- 个人信息：`me`
- 视频：`video show <BV|URL>`，支持 `--subtitle` / `--summary` / `--comments` / `--related` / `--json`
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

构建完成后可直接运行：

```bash
node dist/bin.js --help
node dist/bin.js discover hot --json
node dist/bin.js video show BV1ABcsztEcY --json
```

## 凭证

- 默认将凭证保存到 `~/.bilibili-cli/credential.json`
- 可以通过环境变量 `BILI_TS_CREDENTIAL_PATH` 覆盖保存位置
- `auth login` 会优先尝试通过 `chrome-cookies-secure` 导入本机 Chrome Cookie，失败后退回到终端二维码登录
- 当前仅验证并支持 **Google Chrome** 自动导入；**Microsoft Edge** 在当前环境下无法稳定解密，暂不支持自动导入
- macOS 首次读取时可能会弹出 Keychain 权限确认

## 说明

- 当前版本已覆盖常用查询、登录链路、基础互动写操作和纯文本动态写操作
- 仍未完成的主要能力：`audio`、更完整的认证诊断输出
