<?php

declare(strict_types=1);

use Alias\Distributed\Application\Port\AliasRepository;
use Alias\Distributed\Application\Port\AliasUniquenessGuard;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisAliasRepository;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisClientProvider;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisNode;
use Alias\Distributed\Infrastructure\Strategy\Uniqueness\BloomFilter;
use Alias\Distributed\Infrastructure\Strategy\Uniqueness\BloomFilterPersistence;
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

$envBool = static function (string $key, bool $default): bool {
    $value = $_ENV[$key] ?? null;

    if (!is_string($value) || $value === '') {
        return $default;
    }

    return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
};

$builder->addDefinitions([
    'redis.nodes' => static function () use ($env): array {
        return array_map(
            static fn (string $address): RedisNode => RedisNode::fromAddress($address),
            explode(',', $env('REDIS_CLUSTER_NODES', 'redis-1:6379,redis-2:6379,redis-3:6379,redis-4:6379,redis-5:6379,redis-6:6379,redis-7:6379,redis-8:6379,redis-9:6379,redis-10:6379,redis-11:6379,redis-12:6379')),
        );
    },
    RedisClientProvider::class => static function (Psr\Container\ContainerInterface $container): RedisClientProvider {
        /** @var list<RedisNode> $nodes */
        $nodes = $container->get('redis.nodes');

        return new RedisClientProvider($nodes);
    },
    LocalAliasUniquenessGuard::class => static function () use ($env, $envBool, $envInt): LocalAliasUniquenessGuard {
        $persistence = null;

        if ($envBool('BLOOM_PERSISTENCE_ENABLED', true)) {
            $persistence = new BloomFilterPersistence(
                host: $env('BLOOM_REDIS_HOST', 'bloom-redis'),
                port: $envInt('BLOOM_REDIS_PORT', 6379),
                keyPrefix: $env('BLOOM_REDIS_KEY_PREFIX', 'bloom:aliases'),
                oldGenerationTtlSeconds: $envInt('BLOOM_OLD_GENERATION_TTL_SECONDS', 3600),
            );
        }

        return new LocalAliasUniquenessGuard(
            new BloomFilter(
                sizeBits: $envInt('LOCAL_BLOOM_FILTER_BITS', 10_000_000),
                hashCount: $envInt('LOCAL_BLOOM_FILTER_HASHES', 7),
            ),
            persistence: $persistence,
            flushEveryAdds: $envInt('BLOOM_FLUSH_EVERY_ADDS', 10_000),
            rotateEstimatedItems: $envInt('BLOOM_ROTATE_ESTIMATED_ITEMS', 1_000_000),
        );
    },
    AliasUniquenessGuard::class => DI\get(LocalAliasUniquenessGuard::class),
    AliasRepository::class => DI\autowire(RedisAliasRepository::class),
    RedisAliasRepository::class => DI\autowire(),
    ValidatorInterface::class => static function (): ValidatorInterface {
        return Validation::createValidator();
    },
]);

return $builder->build();
