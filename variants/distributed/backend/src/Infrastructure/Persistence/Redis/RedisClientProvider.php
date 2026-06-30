<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use Redis;

final class RedisClientProvider
{
    /**
     * @var array<string, Redis>
     */
    private array $clients = [];

    /**
     * @param list<RedisShard> $shards
     */
    public function __construct(
        private readonly array $shards,
    ) {
    }

    public function clientFor(RedisShard $shard): Redis
    {
        $key = $shard->key();

        if (!isset($this->clients[$key])) {
            $client = new Redis();
            $client->connect($shard->host, $shard->port);

            $this->clients[$key] = $client;
        }

        return $this->clients[$key];
    }

    /**
     * @return list<RedisShard>
     */
    public function shards(): array
    {
        return $this->shards;
    }
}
