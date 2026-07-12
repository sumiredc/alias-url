<?php

declare(strict_types=1);

use Alias\Distributed\Infrastructure\Persistence\Redis\RedisClientProvider;
use Alias\Distributed\Infrastructure\Persistence\Redis\RedisNode;
use Dotenv\Dotenv;

const DEFAULT_WORKER_MAX_REQUESTS = 100000;
const DEFAULT_REDIRECT_CACHE_MAX_ENTRIES = 0;

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

$nodes = array_map(
    static fn (string $address): RedisNode => RedisNode::fromAddress($address),
    explode(',', envString('REDIS_CLUSTER_NODES', 'redis-1:6379,redis-2:6379,redis-3:6379,redis-4:6379,redis-5:6379,redis-6:6379,redis-7:6379,redis-8:6379,redis-9:6379,redis-10:6379,redis-11:6379,redis-12:6379')),
);

$clientProvider = new RedisClientProvider($nodes);
$redirectCache = new RedirectCache(envInt('REDIRECT_CACHE_MAX_ENTRIES', DEFAULT_REDIRECT_CACHE_MAX_ENTRIES));
$nbRequests = 0;
$workerMaxRequests = workerMaxRequests();

while (frankenphp_handle_request(function () use ($clientProvider, $redirectCache, &$nbRequests): void {
    $nbRequests++;

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
    $requestUri = is_string($requestUri) ? $requestUri : '/';
    $path = parse_url($requestUri, PHP_URL_PATH);
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
    $cachedUrl = $redirectCache->get($alias);

    if ($cachedUrl !== null) {
        header('Location: ' . $cachedUrl, true, 302);

        return;
    }

    $client = $clientProvider->cluster();
    $payload = $client->get($alias);

    if (!is_string($payload) || $payload === '') {
        header('Content-Type: text/plain');
        http_response_code(404);
        echo 'Alias was not found.';

        return;
    }

    $redirectCache->set($alias, $payload);
    header('Location: ' . $payload, true, 302);
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
    return envInt('WORKER_MAX_REQUESTS', DEFAULT_WORKER_MAX_REQUESTS);
}

function envInt(string $key, int $default): int
{
    $value = $_ENV[$key] ?? $default;
    $maxRequests = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    return is_int($maxRequests) ? $maxRequests : $default;
}

final class RedirectCache
{
    /**
     * @var array<string, string>
     */
    private array $items = [];

    public function __construct(
        private readonly int $maxEntries,
    ) {
    }

    public function get(string $alias): ?string
    {
        if ($this->maxEntries <= 0 || !isset($this->items[$alias])) {
            return null;
        }

        $url = $this->items[$alias];
        unset($this->items[$alias]);
        $this->items[$alias] = $url;

        return $url;
    }

    public function set(string $alias, string $url): void
    {
        if ($this->maxEntries <= 0) {
            return;
        }

        if (isset($this->items[$alias])) {
            unset($this->items[$alias]);
        }

        $this->items[$alias] = $url;

        if (count($this->items) <= $this->maxEntries) {
            return;
        }

        $oldestAlias = array_key_first($this->items);

        unset($this->items[$oldestAlias]);
    }
}
