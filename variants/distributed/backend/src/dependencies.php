<?php

declare(strict_types=1);

use Alias\Distributed\Application\Port\AliasRepository;
use Alias\Distributed\Application\Port\AliasUniquenessGuard;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisAliasRepository;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisClientProvider;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisShard;
use Alias\Distributed\Infrastructure\Strategy\Sharding\ConsistentHashShardResolver;
use Alias\Distributed\Infrastructure\Strategy\Uniqueness\BloomFilter;
use Alias\Distributed\Infrastructure\Strategy\Uniqueness\LocalAliasUniquenessGuard;
use DI\ContainerBuilder;
use Symfony\Component\Validator\Validation;
use Symfony\Component\Validator\Validator\ValidatorInterface;

$builder = new ContainerBuilder();

$env = static function (string $key, string $default): string {
    $value = $_ENV[$key] ?? $default;

    return is_string($value) ? $value : $default;
};

$envInt = static function (string $key, int $default): int {
    $value = $_ENV[$key] ?? $default;
    $intValue = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    return is_int($intValue) ? $intValue : $default;
};

$builder->addDefinitions([
    'redis.shards' => static function () use ($env): array {
        return array_map(
            static fn (string $address): RedisShard => RedisShard::fromAddress($address),
            explode(',', $env('REDIS_SHARDS', 'redis-1:6379,redis-2:6379,redis-3:6379')),
        );
    },
    ConsistentHashShardResolver::class => static function (Psr\Container\ContainerInterface $container): ConsistentHashShardResolver {
        /** @var list<RedisShard> $shards */
        $shards = $container->get('redis.shards');

        return new ConsistentHashShardResolver($shards);
    },
    RedisClientProvider::class => static function (Psr\Container\ContainerInterface $container): RedisClientProvider {
        /** @var list<RedisShard> $shards */
        $shards = $container->get('redis.shards');

        return new RedisClientProvider($shards);
    },
    AliasUniquenessGuard::class => static function () use ($envInt): AliasUniquenessGuard {
        return new LocalAliasUniquenessGuard(
            new BloomFilter(
                sizeBits: $envInt('LOCAL_BLOOM_FILTER_BITS', 10_000_000),
                hashCount: $envInt('LOCAL_BLOOM_FILTER_HASHES', 7),
            )
        );
    },
    AliasRepository::class => DI\autowire(RedisAliasRepository::class),
    RedisAliasRepository::class => DI\autowire(),
    ValidatorInterface::class => static function (): ValidatorInterface {
        return Validation::createValidator();
    },
]);

return $builder->build();
