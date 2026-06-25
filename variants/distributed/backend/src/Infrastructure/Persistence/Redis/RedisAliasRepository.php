<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use Alias\Distributed\Application\Port\AliasRepository;
use Alias\Distributed\Infrastructure\Strategy\Sharding\ConsistentHashShardResolver;
use JsonException;

final class RedisAliasRepository implements AliasRepository
{
    public function __construct(
        private ConsistentHashShardResolver $shardResolver,
        private RedisClientProvider $clientProvider,
    ) {
    }

    /**
     * @throws JsonException
     */
    public function create(string $alias, string $url): bool
    {
        $shard = $this->shardResolver->resolve($alias);
        $client = $this->clientProvider->clientFor($shard);
        $payload = json_encode([
            'url' => $url,
            'created_at' => gmdate('c'),
        ], JSON_THROW_ON_ERROR);

        $result = $client->executeRaw(['SET', $this->key($alias), $payload, 'NX']);

        return $result === 'OK';
    }

    /**
     * @return array{alias: string, url: string, created_at: string}|null
     *
     * @throws JsonException
     */
    public function findByAlias(string $alias): ?array
    {
        $shard = $this->shardResolver->resolve($alias);
        $client = $this->clientProvider->clientFor($shard);
        $payload = $client->executeRaw(['GET', $this->key($alias)]);

        if (!is_string($payload) || $payload === '') {
            return null;
        }

        $decoded = json_decode($payload, true, flags: JSON_THROW_ON_ERROR);

        if (!is_array($decoded)) {
            return null;
        }

        $url = $decoded['url'] ?? null;
        $createdAt = $decoded['created_at'] ?? null;

        if (!is_string($url) || !is_string($createdAt)) {
            return null;
        }

        return [
            'alias' => $alias,
            'url' => $url,
            'created_at' => $createdAt,
        ];
    }

    private function key(string $alias): string
    {
        return sprintf('alias:%s', $alias);
    }
}
