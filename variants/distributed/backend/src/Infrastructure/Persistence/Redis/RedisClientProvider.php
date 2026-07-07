<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use RedisCluster;

final class RedisClientProvider
{
    private ?RedisCluster $cluster = null;

    /**
     * @param list<RedisNode> $nodes
     */
    public function __construct(
        private readonly array $nodes,
    ) {
    }

    public function cluster(): RedisCluster
    {
        if (!$this->cluster instanceof RedisCluster) {
            $this->cluster = new RedisCluster(
                null,
                array_map(
                    static fn (RedisNode $node): string => $node->key(),
                    $this->nodes,
                ),
                2.0,
                2.0,
                false,
            );
        }

        return $this->cluster;
    }

    /**
     * @return list<RedisNode>
     */
    public function nodes(): array
    {
        return $this->nodes;
    }
}
