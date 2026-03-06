# 开发测试命令

下面这份命令清单用于本地开发时直接测试 CLI，统一使用：

- 默认视频 BV：`BV1B8fmB5EPJ`
- 命令形式：`pnpm dev ...`

如果只是验证参数解析和接口联通，优先从“只读命令”开始。

## 基础

```bash
pnpm dev -- --help
pnpm dev auth status
pnpm dev auth login
pnpm dev auth logout
pnpm dev me
pnpm dev me --json
```

## 视频

```bash
pnpm dev video show BV1B8fmB5EPJ
pnpm dev video show BV1B8fmB5EPJ --json
pnpm dev video show BV1B8fmB5EPJ --subtitle
pnpm dev video show BV1B8fmB5EPJ --summary
pnpm dev video show BV1B8fmB5EPJ --comments
pnpm dev video show BV1B8fmB5EPJ --related
pnpm dev video show BV1B8fmB5EPJ --subtitle --summary --comments --related
```

## 音频

```bash
pnpm dev audio BV1B8fmB5EPJ
pnpm dev audio BV1B8fmB5EPJ --no-split
pnpm dev audio BV1B8fmB5EPJ --segment 15
pnpm dev audio BV1B8fmB5EPJ -o ./tmp/audio
pnpm dev audio BV1B8fmB5EPJ -o ./tmp/audio --no-split
```

## 用户

`user show` 支持 UID 或昵称，`user videos` 目前使用 UID。

```bash
pnpm dev user show 2
pnpm dev user show 2 --json
pnpm dev user show 老番茄
pnpm dev user show 老番茄 --json
pnpm dev user videos 2
pnpm dev user videos 2 --page 1 --max 10
pnpm dev user videos 2 --json
```

## 搜索

```bash
pnpm dev search users 老番茄
pnpm dev search users 老番茄 --page 1 --max 10
pnpm dev search users 老番茄 --json
pnpm dev search videos 原神
pnpm dev search videos 原神 --page 1 --max 10
pnpm dev search videos 原神 --json
```

## 发现

```bash
pnpm dev discover hot
pnpm dev discover hot --page 1 --max 10
pnpm dev discover hot --json
pnpm dev discover rank
pnpm dev discover rank --day 3
pnpm dev discover rank --json
```

## 时间线与资料库

这些命令需要登录。

```bash
pnpm dev timeline feed
pnpm dev timeline feed --json
pnpm dev timeline mine
pnpm dev timeline mine --json
pnpm dev library favorites
pnpm dev library favorites --json
pnpm dev library favorites 1
pnpm dev library favorites 1 --page 1
pnpm dev library favorites 1 --json
pnpm dev library following
pnpm dev library following --json
pnpm dev library history
pnpm dev library history --json
pnpm dev library watch-later
pnpm dev library watch-later --json
```

## 写操作

下面这些命令会对账号产生真实操作，只在确认要测试时执行。

```bash
pnpm dev interact like BV1B8fmB5EPJ
pnpm dev interact coin BV1B8fmB5EPJ
pnpm dev interact coin BV1B8fmB5EPJ --count 2
pnpm dev interact triple BV1B8fmB5EPJ
pnpm dev interact unfollow 2
pnpm dev timeline post "测试动态，请忽略"
pnpm dev timeline delete <DYNAMIC_ID>
```

## 常用组合

```bash
pnpm dev auth login
pnpm dev video show BV1B8fmB5EPJ --json
pnpm dev audio BV1B8fmB5EPJ -o ./tmp/audio --no-split
pnpm dev search videos 原神 --page 1 --max 5
pnpm dev discover hot --page 1 --max 5
pnpm dev timeline feed --json
```
