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

    private BloomFilter $previousBloomFilter;

    private int $activeGeneration = 1;

    private int $pendingAdds = 0;

    /**
     * @var array<string, true>
     */
    private array $pendingAliases = [];

    public function __construct(
        private BloomFilter $bloomFilter,
        private readonly ?BloomFilterPersistence $persistence = null,
        private readonly int $flushEveryAdds = 10_000,
        private readonly int $rotateEstimatedItems = 1_000_000,
    ) {
        $this->previousBloomFilter = new BloomFilter(
            sizeBits: $this->bloomFilter->sizeBits(),
            hashCount: $this->bloomFilter->hashCount(),
        );
        $this->loadPersistedState();
    }

    public function mightContain(string $alias): bool
    {
        if (strlen($alias) === 1) {
            return isset($this->exactAliases[$alias]);
        }

        return $this->bloomFilter->mightContain($alias) || $this->previousBloomFilter->mightContain($alias);
    }

    public function add(string $alias): void
    {
        $this->pendingAliases[$alias] = true;
    }

    public function __destruct()
    {
        $this->applyPendingAliases();
        $this->flush();
    }

    public function flushIfNeeded(): void
    {
        $this->applyPendingAliases();

        if ($this->pendingAdds >= $this->flushEveryAdds) {
            $this->flush();
        }
    }

    private function loadPersistedState(): void
    {
        if (!$this->persistence instanceof BloomFilterPersistence) {
            return;
        }

        $snapshot = $this->persistence->load(
            sizeBits: $this->bloomFilter->sizeBits(),
            hashCount: $this->bloomFilter->hashCount(),
            emptyBits: $this->bloomFilter->exportBits(),
            hashStrategy: BloomFilter::HASH_STRATEGY,
        );

        $this->activeGeneration = $snapshot->activeGeneration;

        if (is_string($snapshot->currentBits)) {
            $this->bloomFilter->importBits($snapshot->currentBits);
        }

        if (is_string($snapshot->previousBits)) {
            $this->previousBloomFilter->importBits($snapshot->previousBits);
        }
    }

    private function applyPendingAliases(): void
    {
        if ($this->pendingAliases === []) {
            return;
        }

        foreach (array_keys($this->pendingAliases) as $alias) {
            if (strlen($alias) === 1) {
                $this->exactAliases[$alias] = true;

                continue;
            }

            $this->bloomFilter->add($alias);
            $this->pendingAdds++;
        }

        $this->pendingAliases = [];
    }

    private function flush(): void
    {
        if (!$this->persistence instanceof BloomFilterPersistence || $this->pendingAdds <= 0) {
            return;
        }

        $estimatedItems = $this->persistence->flush(
            generation: $this->activeGeneration,
            bits: $this->bloomFilter->exportBits(),
            estimatedItemsDelta: $this->pendingAdds,
            sizeBits: $this->bloomFilter->sizeBits(),
            hashCount: $this->bloomFilter->hashCount(),
            hashStrategy: BloomFilter::HASH_STRATEGY,
        );
        $this->pendingAdds = 0;

        if ($this->rotateEstimatedItems > 0 && is_int($estimatedItems) && $estimatedItems >= $this->rotateEstimatedItems) {
            $this->persistence->rotateIfActive(
                expectedGeneration: $this->activeGeneration,
                sizeBits: $this->bloomFilter->sizeBits(),
                hashCount: $this->bloomFilter->hashCount(),
                emptyBits: str_repeat("\0", $this->bloomFilter->byteSize()),
                hashStrategy: BloomFilter::HASH_STRATEGY,
            );
        }

        $activeGeneration = $this->persistence->activeGenerationValue();

        if (is_int($activeGeneration) && $activeGeneration !== $this->activeGeneration) {
            $this->bloomFilter->clear();
            $this->previousBloomFilter->clear();
            $this->loadPersistedState();
        }
    }
}
