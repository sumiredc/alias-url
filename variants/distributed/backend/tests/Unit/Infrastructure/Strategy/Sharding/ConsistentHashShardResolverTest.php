<?php

declare(strict_types=1);

use Alias\Distributed\Infrastructure\Persistence\Redis\RedisShard;
use Alias\Distributed\Infrastructure\Strategy\Sharding\ConsistentHashShardResolver;

it('resolves the same alias to the same shard', function (): void {
    $resolver = new ConsistentHashShardResolver([
        new RedisShard('redis-1', 6379),
        new RedisShard('redis-2', 6379),
        new RedisShard('redis-3', 6379),
    ]);

    expect($resolver->resolve('summer')->key())
        ->toBe($resolver->resolve('summer')->key());
});

it('resolves to one of the configured shards', function (): void {
    $shards = [
        new RedisShard('redis-1', 6379),
        new RedisShard('redis-2', 6379),
        new RedisShard('redis-3', 6379),
    ];
    $resolver = new ConsistentHashShardResolver($shards);
    $configuredShardKeys = array_map(
        static fn (RedisShard $shard): string => $shard->key(),
        $shards,
    );

    expect($resolver->resolve('summer')->key())
        ->toBeIn($configuredShardKeys);
});

it('requires at least one shard', function (): void {
    new ConsistentHashShardResolver([]);
})->throws(RuntimeException::class, 'At least one Redis shard is required.');
