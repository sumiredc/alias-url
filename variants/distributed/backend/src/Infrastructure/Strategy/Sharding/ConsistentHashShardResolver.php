<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Sharding;

use Alias\Distributed\Infrastructure\Persistence\Redis\RedisShard;
use RuntimeException;

final class ConsistentHashShardResolver
{
    private const VIRTUAL_NODES = 128;

    /**
     * @var array<int, RedisShard>
     */
    private array $ring = [];

    /**
     * @param list<RedisShard> $shards
     */
    public function __construct(array $shards)
    {
        if ($shards === []) {
            throw new RuntimeException('At least one Redis shard is required.');
        }

        foreach ($shards as $shard) {
            for ($index = 0; $index < self::VIRTUAL_NODES; $index++) {
                $this->ring[$this->hash($shard->key() . '#' . $index)] = $shard;
            }
        }

        ksort($this->ring, SORT_NUMERIC);
    }

    public function resolve(string $alias): RedisShard
    {
        $hash = $this->hash($alias);

        foreach ($this->ring as $position => $shard) {
            if ($hash <= $position) {
                return $shard;
            }
        }

        $firstShard = reset($this->ring);

        if (!$firstShard instanceof RedisShard) {
            throw new RuntimeException('Redis shard ring is empty.');
        }

        return $firstShard;
    }

    private function hash(string $value): int
    {
        $hash = crc32($value);

        return $hash < 0 ? $hash + 4_294_967_296 : $hash;
    }
}
