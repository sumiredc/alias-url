<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use Alias\Distributed\Application\Port\AliasRepository;
use Alias\Distributed\Infrastructure\Strategy\Sharding\ConsistentHashShardResolver;

final class RedisAliasRepository implements AliasRepository
{
    public function __construct(
        private ConsistentHashShardResolver $shardResolver,
        private RedisClientProvider $clientProvider,
    ) {
    }

    public function create(string $alias, string $url): bool
    {
        $shard = $this->shardResolver->resolve($alias);
        $client = $this->clientProvider->clientFor($shard);

        $result = $client->set($this->key($alias), $url, ['nx']);

        return $result === true;
    }

    /**
     * @return array{alias: string, url: string}|null
     */
    public function findByAlias(string $alias): ?array
    {
        $shard = $this->shardResolver->resolve($alias);
        $client = $this->clientProvider->clientFor($shard);
        $payload = $client->get($this->key($alias));

        if (!is_string($payload) || $payload === '') {
            return null;
        }

        if ($payload[0] !== '{') {
            return [
                'alias' => $alias,
                'url' => $payload,
            ];
        }

        $decoded = json_decode($payload, true);

        if (!is_array($decoded)) {
            return null;
        }

        $url = $decoded['url'] ?? null;

        if (!is_string($url)) {
            return null;
        }

        return [
            'alias' => $alias,
            'url' => $url,
        ];
    }

    private function key(string $alias): string
    {
        return $alias;
    }
}
