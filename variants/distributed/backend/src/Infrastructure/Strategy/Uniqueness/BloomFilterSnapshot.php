<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Uniqueness;

final readonly class BloomFilterSnapshot
{
    public function __construct(
        public int $activeGeneration,
        public ?string $currentBits,
        public ?string $previousBits,
    ) {
    }
}
