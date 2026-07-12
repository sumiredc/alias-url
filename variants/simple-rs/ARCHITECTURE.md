# simple-rs

`simple` と同じ API / MySQL schema を使う Rust 実装です。

## 構成

```mermaid
flowchart LR
    client[Client / k6] --> gateway[nginx gateway]
    gateway --> backend[Rust backend<br/>axum / tokio / sqlx]
    backend --> mysql[(MySQL)]
```

## リクエスト経路

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant Backend as axum backend
    participant MySQL

    Client->>Gateway: POST /api/aliases
    Gateway->>Backend: forward
    Backend->>MySQL: SELECT / INSERT
    Backend-->>Client: 201 or 409

    Client->>Gateway: GET /{alias}
    Gateway->>Backend: forward
    Backend->>MySQL: SELECT url by alias
    Backend-->>Client: 302 or 404
```

## 役割

| 項目 | 内容 |
| --- | --- |
| HTTP | `axum` |
| async runtime | `tokio` |
| MySQL client | `sqlx` |
| store | MySQL |
| schema | `variants/simple/mysql/init/001_create_aliases.sql` と同等 |

## ルート

```text
GET  /health
POST /api/aliases
GET  /{alias}
```

## DB 接続

```mermaid
flowchart LR
    env[env] --> pool[sqlx MySQL pool]
    pool --> mysql[(MySQL)]

    env --> ssl[DB_SSL_MODE]
    env --> max[DB_MAX_CONNECTIONS]
    env --> min[DB_MIN_CONNECTIONS]
```

| 変数 | 既定値 | 備考 |
| --- | --- | --- |
| `DB_SSL_MODE` | `required` | `preferred` / `required` / `verify_ca` / `verify_identity` |
| `DB_MAX_CONNECTIONS` | `32` | backend container ごとの上限 |
| `DB_MIN_CONNECTIONS` | `min(4, max)` | 起動時に確保する接続数 |

scaled 時の最大接続数:

```text
BACKEND_SCALE * DB_MAX_CONNECTIONS
```

例:

```bash
DB_MAX_CONNECTIONS=32 BACKEND_SCALE=3 task bench:all:large:scaled
```

## スケーリング

```mermaid
flowchart LR
    gateway[nginx gateway] --> b1[backend replica 1]
    gateway --> b2[backend replica 2]
    gateway --> b3[backend replica 3]
    b1 --> mysql[(MySQL)]
    b2 --> mysql
    b3 --> mysql
```

```bash
task simple-rs:up:scaled
```
