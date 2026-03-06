# bilibili-cli-ts

A Bilibili CLI built with `Node.js` and `TypeScript`.

Implemented with reference to [jackwener/bilibili-cli](https://github.com/jackwener/bilibili-cli).

## Install

```bash
pnpm install
pnpm build
```

## Usage

Development mode:

```bash
pnpm dev help
pnpm dev auth status
pnpm dev video show BV1ABcsztEcY
```

Run the built output:

```bash
node dist/bin.js help
node dist/bin.js auth status
node dist/bin.js video show BV1ABcsztEcY
```

Use it as a global CLI:

```bash
pnpm link --global
bili-ts help
bili-ts auth status
bili-ts video show BV1ABcsztEcY
```

Show full command help:

```bash
bili-ts help
bili-ts video show --help
bili-ts timeline mine --help
```

## Auth

- `auth login`: login with a terminal QR code
- `auth status`: show current login status
- `auth logout`: clear local credentials
- Default credential path: `~/.bilibili-cli/credential.json`
- Override the credential path with `BILI_TS_CREDENTIAL_PATH`
- If no valid local credential is found, the CLI will try to read Chrome cookies

## Common Commands

```bash
# current account
bili-ts me

# video
bili-ts video show <BV|URL>
bili-ts video show <BV|URL> --json
bili-ts video show <BV|URL> --subtitle --summary --comments --related

# audio
bili-ts audio <BV|URL>
bili-ts audio <BV|URL> --no-split
bili-ts audio <BV|URL> -o ./tmp/audio

# user
bili-ts user show <uid|name>
bili-ts user videos <uid|name>

# search
bili-ts search users <keyword>
bili-ts search videos <keyword>

# discovery
bili-ts discover hot
bili-ts discover rank

# interactions
bili-ts interact like <BV|URL>
bili-ts interact like <BV|URL> --undo
bili-ts interact coin <BV|URL> --count 2
bili-ts interact triple <BV|URL>
bili-ts interact unfollow <uid> --yes

# timeline
bili-ts timeline feed
bili-ts timeline mine
bili-ts timeline post "test dynamic"
bili-ts timeline delete <dynamicId> --yes

# library
bili-ts library favorites
bili-ts library favorites <folderId>
bili-ts library following
bili-ts library history
bili-ts library watch-later
```

The list above covers the command groups and subcommands. For the full option list, use `--help` on the specific command.

## Audio

- `audio` downloads the audio track and splits it into 16kHz mono WAV files by default
- `ffmpeg` is required for audio splitting
- Use `--no-split` to keep the original full audio file

## Development

```bash
pnpm test
pnpm typecheck
pnpm typecheck:test
pnpm typecheck:all
pnpm build
```
