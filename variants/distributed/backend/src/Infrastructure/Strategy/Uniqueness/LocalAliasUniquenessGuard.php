<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Uniqueness;

use Alias\Distributed\Application\Port\AliasUniquenessGuard;

final class LocalAliasUniquenessGuard implements AliasUniquenessGuard
{
    /**
     * @var array<string, true>
     */
    private array $exactAliases = [];

    private int $nextRotateAt;

    public function __construct(
        private BloomFilter $bloomFilter,
        private readonly int $rotateSeconds,
    ) {
        $this->nextRotateAt = time() + $this->rotateSeconds;
    }

    public function mightContain(string $alias): bool
    {
        $this->rotateIfNeeded();

        if (strlen($alias) === 1) {
            return isset($this->exactAliases[$alias]);
        }

        return $this->bloomFilter->mightContain($alias);
    }

    public function add(string $alias): void
    {
        $this->rotateIfNeeded();

        if (strlen($alias) === 1) {
            $this->exactAliases[$alias] = true;

            return;
        }

        $this->bloomFilter->add($alias);
    }

    private function rotateIfNeeded(): void
    {
        $now = time();

        if ($now < $this->nextRotateAt) {
            return;
        }

        $this->bloomFilter->reset();
        $this->nextRotateAt = $now + $this->rotateSeconds;
    }
}
