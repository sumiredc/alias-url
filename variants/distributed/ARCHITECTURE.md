# distributed アーキテクチャ

`distributed` は Redis Cluster を primary store にする構成です。

## トポロジ

```mermaid
flowchart TB
    client[Client / k6 / Browser]
    gateway[nginx gateway]
    api[backend<br/>FrankenPHP + Slim]
    redirect[backend-redirect<br/>FrankenPHP worker]
    cluster[RedisCluster client]

    subgraph redis[Redis Cluster<br/>12 master nodes]
        r1[(redis-1)]
        r2[(redis-2)]
        r3[(...)]
        r12[(redis-12)]
    end

    client --> gateway
    gateway -- "POST /api/aliases<br/>GET /health" --> api
    gateway -- "GET /:alias" --> redirect
    api --> cluster
    redirect --> cluster
    cluster --> r1
    cluster --> r2
    cluster --> r3
    cluster --> r12
```

## シャーディング

```mermaid
flowchart LR
    alias[alias] --> slot["CRC16(alias) % 16384"]
    slot --> owner[hash slot owner]
    owner --> node[Redis master node]
```

| 項目 | 値 |
| --- | --- |
| master node 数 | 12 |
| hash slot 数 | 16,384 |
| routing | Redis Cluster client |
| Redis key | `{alias}` |
| Redis value | `{url}` |
| Redis クライアント | phpredis |

アプリは Redis Cluster client に key を渡します。client が hash slot を解決し、担当 master node へ routing します。

## 登録経路

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant B as backend
    participant F as Local Filter
    participant RC as RedisCluster client
    participant S as Redis Cluster

    C->>G: POST /api/aliases
    G->>B: request
    B->>B: validate
    B->>F: check(alias)
    alt local may exist
        B-->>C: 409
    else local not found
        B->>RC: SET alias url NX
        RC->>S: route by hash slot
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
    participant RC as RedisCluster client
    participant S as Redis Cluster

    C->>G: GET /:alias
    G->>R: request
    R->>L: get(alias)
    alt hit
        R-->>C: 302 Location
    else miss
        R->>RC: GET alias
        RC->>S: route by hash slot
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
        b1 --> rs1[Redis Cluster]
    end

    subgraph redirectDirect[redirect direct]
        seed[k6 seed] --> b2[backend:8081]
        bench[k6 redirect] --> r2[backend-redirect:8080]
        b2 --> rs2[Redis Cluster]
        r2 --> rs2
    end
```
