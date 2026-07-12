<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Uniqueness;

use Redis;
use Throwable;

final class BloomFilterPersistence
{
    private const INITIAL_GENERATION = 1;

    private ?Redis $client = null;

    public function __construct(
        private readonly string $host,
        private readonly int $port,
        private readonly string $keyPrefix,
        private readonly int $oldGenerationTtlSeconds,
    ) {
    }

    public function load(int $sizeBits, int $hashCount, string $emptyBits, string $hashStrategy): BloomFilterSnapshot
    {
        try {
            $client = $this->client();
            $activeGeneration = $this->activeGeneration($client);

            $this->ensureGeneration($client, $activeGeneration, $sizeBits, $hashCount, $emptyBits, $hashStrategy);

            return new BloomFilterSnapshot(
                activeGeneration: $activeGeneration,
                currentBits: $this->validGenerationBits($client, $activeGeneration, strlen($emptyBits), $sizeBits, $hashCount, $hashStrategy),
                previousBits: $this->validGenerationBits($client, $activeGeneration - 1, strlen($emptyBits), $sizeBits, $hashCount, $hashStrategy),
            );
        } catch (Throwable) {
            return new BloomFilterSnapshot(self::INITIAL_GENERATION, null, null);
        }
    }

    public function flush(int $generation, string $bits, int $estimatedItemsDelta, int $sizeBits, int $hashCount, string $hashStrategy): ?int
    {
        if ($estimatedItemsDelta <= 0) {
            return $this->estimatedItems($generation);
        }

        try {
            $client = $this->client();
            $this->ensureGeneration($client, $generation, $sizeBits, $hashCount, str_repeat("\0", strlen($bits)), $hashStrategy);

            $script = <<<'LUA'
local existing = redis.call("GET", KEYS[1])
local incoming = ARGV[1]

if not existing then
  existing = string.rep("\0", string.len(incoming))
end

local len = string.len(incoming)
local out = {}

for i = 1, len do
  local a = string.byte(existing, i) or 0
  local b = string.byte(incoming, i) or 0
  out[i] = string.char(bit.bor(a, b))
end

redis.call("SET", KEYS[1], table.concat(out))
return redis.call("HINCRBY", KEYS[2], "estimated_items", ARGV[2])
LUA;

            $result = $client->rawCommand(
                'EVAL',
                $script,
                '2',
                $this->bitsKey($generation),
                $this->metaKey($generation),
                $bits,
                (string) $estimatedItemsDelta,
            );

            return is_int($result) ? $result : null;
        } catch (Throwable) {
            return null;
        }
    }

    public function rotateIfActive(int $expectedGeneration, int $sizeBits, int $hashCount, string $emptyBits, string $hashStrategy): bool
    {
        try {
            $client = $this->client();
            $lockToken = bin2hex(random_bytes(16));

            if ($client->set($this->lockKey(), $lockToken, ['nx', 'ex' => 30]) !== true) {
                return false;
            }

            try {
                $activeGeneration = $this->activeGeneration($client);

                if ($activeGeneration !== $expectedGeneration) {
                    return false;
                }

                $nextGeneration = $activeGeneration + 1;
                $now = gmdate('c');

                $client->set($this->bitsKey($nextGeneration), $emptyBits);
                $client->hMSet($this->metaKey($nextGeneration), [
                    'generation' => (string) $nextGeneration,
                    'size_bits' => (string) $sizeBits,
                    'hash_count' => (string) $hashCount,
                    'hash_strategy' => $hashStrategy,
                    'estimated_items' => '0',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $client->set($this->activeGenerationKey(), (string) $nextGeneration);

                $expiredGeneration = $activeGeneration - 1;

                if ($expiredGeneration >= self::INITIAL_GENERATION) {
                    $client->expire($this->bitsKey($expiredGeneration), $this->oldGenerationTtlSeconds);
                    $client->expire($this->metaKey($expiredGeneration), $this->oldGenerationTtlSeconds);
                }

                return true;
            } finally {
                if ($client->get($this->lockKey()) === $lockToken) {
                    $client->del($this->lockKey());
                }
            }
        } catch (Throwable) {
            return false;
        }
    }

    public function activeGenerationValue(): ?int
    {
        try {
            return $this->activeGeneration($this->client());
        } catch (Throwable) {
            return null;
        }
    }

    private function estimatedItems(int $generation): ?int
    {
        try {
            $value = $this->client()->hGet($this->metaKey($generation), 'estimated_items');

            return is_string($value) && ctype_digit($value) ? (int) $value : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function client(): Redis
    {
        if (!$this->client instanceof Redis) {
            $this->client = new Redis();
            $this->client->connect($this->host, $this->port, 2.0);
        }

        return $this->client;
    }

    private function activeGeneration(Redis $client): int
    {
        $value = $client->get($this->activeGenerationKey());

        if (is_string($value) && ctype_digit($value)) {
            return max(self::INITIAL_GENERATION, (int) $value);
        }

        $client->set($this->activeGenerationKey(), (string) self::INITIAL_GENERATION, ['nx']);

        return self::INITIAL_GENERATION;
    }

    private function ensureGeneration(Redis $client, int $generation, int $sizeBits, int $hashCount, string $emptyBits, string $hashStrategy): void
    {
        $client->set($this->bitsKey($generation), $emptyBits, ['nx']);

        if ($client->exists($this->metaKey($generation)) === 0 || !$this->metaMatches($client, $generation, $sizeBits, $hashCount, $hashStrategy)) {
            $now = gmdate('c');
            $client->set($this->bitsKey($generation), $emptyBits);
            $client->hMSet($this->metaKey($generation), [
                'generation' => (string) $generation,
                'size_bits' => (string) $sizeBits,
                'hash_count' => (string) $hashCount,
                'hash_strategy' => $hashStrategy,
                'estimated_items' => '0',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function validBits(mixed $bits, int $byteSize): ?string
    {
        return is_string($bits) && strlen($bits) === $byteSize ? $bits : null;
    }

    private function validGenerationBits(Redis $client, int $generation, int $byteSize, int $sizeBits, int $hashCount, string $hashStrategy): ?string
    {
        if ($generation < self::INITIAL_GENERATION || !$this->metaMatches($client, $generation, $sizeBits, $hashCount, $hashStrategy)) {
            return null;
        }

        return $this->validBits($client->get($this->bitsKey($generation)), $byteSize);
    }

    private function metaMatches(Redis $client, int $generation, int $sizeBits, int $hashCount, string $hashStrategy): bool
    {
        $meta = $client->hGetAll($this->metaKey($generation));

        return is_array($meta)
            && ($meta['size_bits'] ?? null) === (string) $sizeBits
            && ($meta['hash_count'] ?? null) === (string) $hashCount
            && ($meta['hash_strategy'] ?? null) === $hashStrategy;
    }

    private function activeGenerationKey(): string
    {
        return "{$this->keyPrefix}:active_generation";
    }

    private function bitsKey(int $generation): string
    {
        return "{$this->keyPrefix}:g:{$generation}:bits";
    }

    private function metaKey(int $generation): string
    {
        return "{$this->keyPrefix}:g:{$generation}:meta";
    }

    private function lockKey(): string
    {
        return "{$this->keyPrefix}:rotate_lock";
    }
}
