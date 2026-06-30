<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Sharding;

use Alias\Distributed\Infrastructure\Persistence\Redis\RedisShard;
use RuntimeException;

final class ConsistentHashShardResolver
{
    private const VIRTUAL_NODES = 1024;

    /**
     * @var array<int, RedisShard>
     */
    private array $ring = [];

    /**
     * @var list<int>
     */
    private array $positions = [];

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
        $this->positions = array_keys($this->ring);
    }

    public function resolve(string $alias): RedisShard
    {
        $hash = $this->hash($alias);
        $position = $this->positions[$this->lowerBound($hash) % count($this->positions)];

        if (!isset($this->ring[$position])) {
            throw new RuntimeException('Redis shard ring is empty.');
        }

        return $this->ring[$position];
    }

    private function hash(string $value): int
    {
        $hash = crc32($value);

        return $hash < 0 ? $hash + 4_294_967_296 : $hash;
    }

    private function lowerBound(int $hash): int
    {
        $left = 0;
        $right = count($this->positions);

        while ($left < $right) {
            $middle = intdiv($left + $right, 2);

            if ($this->positions[$middle] < $hash) {
                $left = $middle + 1;
            } else {
                $right = $middle;
            }
        }

        return $left;
    }
}
