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

    public function __construct(
        private BloomFilter $bloomFilter,
    ) {
    }

    public function mightContain(string $alias): bool
    {
        if (strlen($alias) === 1) {
            return isset($this->exactAliases[$alias]);
        }

        return $this->bloomFilter->mightContain($alias);
    }

    public function add(string $alias): void
    {
        if (strlen($alias) === 1) {
            $this->exactAliases[$alias] = true;

            return;
        }

        $this->bloomFilter->add($alias);
    }
}
