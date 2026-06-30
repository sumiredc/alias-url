# distributed アーキテクチャ

`distributed` は Redis shard を primary store にする構成です。

## トポロジ

```mermaid
flowchart TB
    client[Client / k6 / Browser]
    gateway[nginx gateway]
    api[backend<br/>FrankenPHP + Slim]
    redirect[backend-redirect<br/>FrankenPHP worker]
    resolver[ConsistentHashShardResolver<br/>binary search]

    subgraph redis[Redis shards]
        r1[(redis-1)]
        r2[(redis-2)]
        r3[(...)]
        r12[(redis-12)]
    end

    client --> gateway
    gateway -- "POST /api/aliases<br/>GET /health" --> api
    gateway -- "GET /:alias" --> redirect
    api --> resolver
    redirect --> resolver
    resolver --> r1
    resolver --> r2
    resolver --> r3
    resolver --> r12
```

## シャーディング

```mermaid
flowchart LR
    alias[alias] --> h1[crc32 alias]
    h1 --> search[lower_bound on sorted ring]
    search --> node[virtual node]
    node --> shard[Redis shard]
```

| 項目 | 値 |
| --- | --- |
| shard 数 | 12 |
| virtual nodes | 1024 / shard |
| 探索 | sorted ring に対する binary search |
| Redis key | `{alias}` |
| Redis value | `{url}` |
| Redis クライアント | phpredis |

Redis Cluster は使っていません。Redis Cluster の hash slot ではなく、アプリ側の consistent hash ring で shard を決めます。

## 登録経路

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant B as backend
    participant F as Local Filter
    participant R as Resolver
    participant S as Redis Shard

    C->>G: POST /api/aliases
    G->>B: request
    B->>B: validate
    B->>F: check(alias)
    alt local may exist
        B-->>C: 409
    else local not found
        B->>R: resolve(alias)
        R-->>B: shard
        B->>S: SET alias url NX
        alt created
            S-->>B: true
            B->>F: add(alias)
            B-->>C: 201
        else exists
            S-->>B: false
            B->>F: add(alias)
            B-->>C: 409
        end
    end
```

## リダイレクト経路

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant R as backend-redirect
    participant L as Local LRU
    participant H as Resolver
    participant S as Redis Shard

    C->>G: GET /:alias
    G->>R: request
    R->>L: get(alias)
    alt hit
        R-->>C: 302 Location
    else miss
        R->>H: resolve(alias)
        H-->>R: shard
        R->>S: GET alias
        alt found
            S-->>R: URL
            R->>L: set(alias, URL)
            R-->>C: 302 Location
        else not found
            S-->>R: null
            R-->>C: 404
        end
    end
```

## ローカル Filter

create 用の早期 reject です。redirect では使いません。

```mermaid
flowchart LR
    alias[alias] --> len{短い alias?}
    len -->|yes| exact[local exact set]
    len -->|no| bloom[local Bloom filter]
    exact --> maybe[may exist -> 409]
    bloom --> maybe
    bloom --> miss[not local -> Redis SET NX]
```

| 項目 | 内容 |
| --- | --- |
| 用途 | create / create-existing の Redis 到達削減 |
| 所有 | backend worker process |
| 共有 | しない |
| 永続化 | 未実装 |
| false positive | 許容する |

永続化する場合は、専用 `redis-bloom` に定期 flush し、`BITOP OR` で merge する方針です。

## リダイレクト Cache

```mermaid
flowchart LR
    env[REDIRECT_CACHE_MAX_ENTRIES] --> cache{0?}
    cache -->|yes| disabled[cache disabled]
    cache -->|no| lru[process-local LRU]
    lru --> hit[hit: Redis GET skip]
    lru --> miss[miss: Redis GET]
```

cache は `backend-redirect` worker process ごとに独立します。

## Direct ベンチ

```mermaid
flowchart TB
    subgraph createDirect[create direct]
        c1[k6] --> b1[backend:8080]
        b1 --> rs1[Redis shards]
    end

    subgraph redirectDirect[redirect direct]
        seed[k6 seed] --> b2[backend:8081]
        bench[k6 redirect] --> r2[backend-redirect:8080]
        b2 --> rs2[Redis shards]
        r2 --> rs2
    end
```
