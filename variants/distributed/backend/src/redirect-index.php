<?php

declare(strict_types=1);

use Alias\Distributed\Infrastructure\Persistence\Redis\RedisClientProvider;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisShard;
use Alias\Distributed\Infrastructure\Strategy\Sharding\ConsistentHashShardResolver;
use Dotenv\Dotenv;

const DEFAULT_WORKER_MAX_REQUESTS = 100000;

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

$shards = array_map(
    static fn (string $address): RedisShard => RedisShard::fromAddress($address),
    explode(',', envString('REDIS_SHARDS', 'redis-1:6379,redis-2:6379,redis-3:6379')),
);

$shardResolver = new ConsistentHashShardResolver($shards);
$clientProvider = new RedisClientProvider($shards);
$nbRequests = 0;
$workerMaxRequests = workerMaxRequests();

while (frankenphp_handle_request(function () use ($shardResolver, $clientProvider, &$nbRequests): void {
    $nbRequests++;

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $path = is_string($path) ? $path : '/';

    if ($path === '/health') {
        header('Content-Type: application/json');
        http_response_code(200);
        echo '{"status":"ok"}';

        return;
    }

    if ($method !== 'GET' || !preg_match('/^\/([A-Za-z0-9_-]+)$/', $path, $matches)) {
        header('Content-Type: text/plain');
        http_response_code(404);
        echo 'Not Found';

        return;
    }

    $alias = $matches[1];
    $shard = $shardResolver->resolve($alias);
    $client = $clientProvider->clientFor($shard);
    $payload = $client->executeRaw(['GET', sprintf('alias:%s', $alias)]);

    if (!is_string($payload) || $payload === '') {
        header('Content-Type: text/plain');
        http_response_code(404);
        echo 'Alias was not found.';

        return;
    }

    $url = urlFromPayload($payload);

    if ($url === null) {
        header('Content-Type: text/plain');
        http_response_code(500);
        echo 'Invalid alias payload.';

        return;
    }

    header('Location: ' . $url, true, 302);
})) {
    if ($nbRequests >= $workerMaxRequests) {
        break;
    }
}

function envString(string $key, string $default): string
{
    $value = $_ENV[$key] ?? $default;

    return is_string($value) ? $value : $default;
}

function workerMaxRequests(): int
{
    $value = $_ENV['WORKER_MAX_REQUESTS'] ?? DEFAULT_WORKER_MAX_REQUESTS;
    $maxRequests = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    return is_int($maxRequests) ? $maxRequests : DEFAULT_WORKER_MAX_REQUESTS;
}

function urlFromPayload(string $payload): ?string
{
    if ($payload[0] !== '{') {
        return $payload;
    }

    try {
        $decoded = json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return null;
    }

    if (!is_array($decoded)) {
        return null;
    }

    $url = $decoded['url'] ?? null;

    return is_string($url) && $url !== '' ? $url : null;
}
