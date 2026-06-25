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

    private function key(string $alias): string
    {
        return sprintf('alias:%s', $alias);
    }
}
