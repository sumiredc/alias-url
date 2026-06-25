<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use Alias\Distributed\Infrastructure\Persistence\Redis\RedisShard;
use Predis\Client;

final class RedisClientProvider
{
    /**
     * @var array<string, Client>
     */
    private array $clients = [];

    /**
     * @param list<RedisShard> $shards
     */
    public function __construct(
        private readonly array $shards,
    ) {
    }

    public function clientFor(RedisShard $shard): Client
    {
        $key = $shard->key();

        if (!isset($this->clients[$key])) {
            $this->clients[$key] = new Client([
                'scheme' => 'tcp',
                'host' => $shard->host,
                'port' => $shard->port,
            ]);
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
