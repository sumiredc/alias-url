<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use InvalidArgumentException;

final readonly class RedisShard
{
    public function __construct(
        public string $host,
        public int $port,
    ) {
    }

    public static function fromAddress(string $address): self
    {
        $parts = explode(':', trim($address), 2);

        if (count($parts) !== 2 || $parts[0] === '') {
            throw new InvalidArgumentException(sprintf('Invalid Redis shard address: %s', $address));
        }

        $port = filter_var($parts[1], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);

        if (!is_int($port)) {
            throw new InvalidArgumentException(sprintf('Invalid Redis shard port: %s', $address));
        }

        return new self($parts[0], $port);
    }

    public function key(): string
    {
        return "{$this->host}:{$this->port}";
    }
}
