# Alias URL

短縮 URL サービスのバックエンド構成を比較するためのサンプルリポジトリです。

フロントエンドと API contract は共通にし、バックエンド構成とインフラ構成の違いを比較します。

## 構成

```text
frontend/
  共通の登録画面

variants/
  simple/
    nginx gateway -> FrankenPHP / Slim -> MySQL

  distributed/
    nginx gateway -> backend / backend-redirect -> Redis shards

bench/
  k6 benchmark scripts and comparison tools
```

## Variants

### simple

MySQL 1 台を primary store として使う構成です。

```text
nginx gateway
  -> FrankenPHP / Slim
      -> MySQL
```

詳細は [variants/simple/ARCHITECTURE.md](variants/simple/ARCHITECTURE.md) を参照してください。

### distributed

Redis shard を primary store として使う構成です。通常の API backend と redirect 専用 backend を分けています。

```text
nginx gateway
  /api/*  -> backend
  /{alias} -> backend-redirect

backend / backend-redirect
  -> Redis shard 1
  -> Redis shard 2
  -> Redis shard 3
```

詳細は [variants/distributed/ARCHITECTURE.md](variants/distributed/ARCHITECTURE.md) を参照してください。

## 起動

simple:

```bash
task simple:up
```

distributed:

```bash
task distributed:up
```

どちらも gateway は `http://localhost:8080` で起動します。同時には起動せず、切り替える場合は片方を down してください。

```bash
task simple:down
task distributed:down
```

frontend:

```bash
task frontend:dev
```

frontend は `http://localhost:5173` で起動します。

## API

### Alias 登録

```http
POST /api/aliases
Content-Type: application/json

{
  "url": "https://example.com/page",
  "alias": "campaign-2026"
}
```

成功時:

```json
{
  "alias": "campaign-2026",
  "url": "https://example.com/page",
  "shortUrl": "http://localhost:8080/campaign-2026"
}
```

### Redirect

```http
GET /{alias}
```

登録済みの alias であれば、保存済み URL へ `302 Found` でリダイレクトします。

## Benchmark

k6 を使って simple / distributed の性能を比較します。

通常構成:

```bash
task bench:simple
task bench:distributed
task bench:compare
```

scaled 構成:

```bash
task bench:simple:scaled
task bench:distributed:scaled
task bench:compare:scaled
```

direct 構成:

```bash
task bench:simple:direct
task bench:distributed:direct
task bench:distributed:redirect:direct
task bench:compare:direct:create
task bench:compare:direct:redirect
```

詳細は [bench/README.md](bench/README.md) を参照してください。

## よく使う task

```bash
task frontend:build

task simple:up
task simple:down
task simple:logs
task simple:up:scaled

task distributed:up
task distributed:down
task distributed:logs
task distributed:up:scaled

task bench:simple
task bench:distributed
task bench:compare

task simple-backend:fmt
task simple-backend:fmt:diff
task simple-backend:phpstan

task distributed-backend:fmt
task distributed-backend:fmt:diff
task distributed-backend:phpstan
```
