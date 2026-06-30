# distributed

Redis shard を使う分散構成です。登録系 backend と redirect 専用 backend を分けます。

## 構成

```mermaid
flowchart LR
    client[Client / k6] --> gateway[nginx gateway]
    gateway -- "/api/*, /health" --> backend[backend<br/>FrankenPHP + Slim]
    gateway -- "/:alias" --> redirect[backend-redirect<br/>FrankenPHP worker]

    backend --> resolver[Consistent hash resolver]
    redirect --> resolver

    resolver --> r1[(redis-1)]
    resolver --> r2[(redis-2)]
    resolver --> r3[(...)]
    resolver --> r12[(redis-12)]
```

## データ

Redis は 12 shard です。Redis Cluster は使わず、アプリ側で shard を決めます。

```mermaid
flowchart LR
    alias[alias] --> hash[crc32]
    hash --> ring[consistent hash ring<br/>1024 virtual nodes / shard]
    ring --> shard[Redis shard]
    shard --> kv["key = alias<br/>value = URL"]
```

保存形式:

```text
{alias} => {url}
```

例:

```text
bench-100000000-seed-1 => https://example.com/benchmark/bench-100000000-seed-1
```

## 登録

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant Backend
    participant Filter as Local exact/Bloom
    participant Resolver
    participant Redis

    Client->>Gateway: POST /api/aliases
    Gateway->>Backend: forward
    Backend->>Filter: may exist?
    alt may exist
        Backend-->>Client: 409
    else not local
        Backend->>Resolver: resolve(alias)
        Resolver-->>Backend: shard
        Backend->>Redis: SET alias url NX
        Redis-->>Backend: OK or nil
        Backend->>Filter: add(alias)
        Backend-->>Client: 201 or 409
    end
```

## リダイレクト

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant Redirect as backend-redirect
    participant Cache as Local LRU
    participant Resolver
    participant Redis

    Client->>Gateway: GET /:alias
    Gateway->>Redirect: forward
    Redirect->>Cache: get(alias)
    alt cache hit
        Redirect-->>Client: 302
    else cache miss
        Redirect->>Resolver: resolve(alias)
        Resolver-->>Redirect: shard
        Redirect->>Redis: GET alias
        Redis-->>Redirect: URL or null
        Redirect->>Cache: set(alias, URL)
        Redirect-->>Client: 302 or 404
    end
```

`backend-redirect` は Slim を通さず、`src/redirect-index.php` を直接実行します。Redis クライアントは phpredis です。

## リダイレクト Cache

process-local な LRU cache です。デフォルトは無効です。

```bash
REDIRECT_CACHE_MAX_ENTRIES=100000 task bench:redirect:scaled:simple-rs:large
```

| 変数 | 既定値 | 内容 |
| --- | ---: | --- |
| `REDIRECT_CACHE_MAX_ENTRIES` | `0` | 0 で無効。1 以上で worker process 内 cache を有効化 |

cache は replica / worker ごとに独立し、worker 再起動で破棄されます。

## 主要 task

```bash
task distributed:up
task distributed:up:scaled
task distributed:down
task distributed:logs

task bench:distributed
task bench:distributed:scaled
task bench:distributed:redirect:direct
task bench:distributed:redirect:scaled
```
