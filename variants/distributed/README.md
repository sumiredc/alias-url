# distributed

分散・高速化構成を検討するためのディレクトリです。

## 検討テーマ

- Redis を保存先として使う
- Backend を水平分散する
- DB または Redis を shard する
- consistent hashing によって alias の保存先を決める
- alias 登録時のユニーク検証を対象 shard 内で完結させる

## 想定構成

```text
frontend
  -> nginx gateway
      /api/*, /health -> backend
      /{alias}        -> backend-redirect
          -> Redis shard
```

alias を key として hash し、保存先 shard を決めます。

```text
shard = consistentHash(alias)
```

同じ alias は常に同じ shard に向かうため、登録時の一意性確認は全 shard を見る必要がありません。

## simple との差分

simple:

```text
backend
  -> MySQL
```

distributed:

```text
gateway
  -> backend
  -> backend-redirect

backend / backend-redirect
  -> shard resolver
      -> Redis shard
```

フロントエンドと API contract は simple と同じにします。
