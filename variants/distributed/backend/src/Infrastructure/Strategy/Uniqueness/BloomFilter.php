<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Uniqueness;

final class BloomFilter
{
    private const UINT32_SIZE = 4_294_967_296;

    public const HASH_STRATEGY = 'crc32-double-v1';

    private string $bits;

    public function __construct(
        private readonly int $sizeBits,
        private readonly int $hashCount,
    ) {
        $this->bits = str_repeat("\0", intdiv($sizeBits + 7, 8));
    }

    public function add(string $value): void
    {
        foreach ($this->positions($value) as $position) {
            $byteIndex = intdiv($position, 8);
            $mask = 1 << ($position % 8);
            $this->bits[$byteIndex] = chr((ord($this->bits[$byteIndex]) | $mask) & 255);
        }
    }

    public function mightContain(string $value): bool
    {
        foreach ($this->positions($value) as $position) {
            $byteIndex = intdiv($position, 8);
            $mask = 1 << ($position % 8);

            if ((ord($this->bits[$byteIndex]) & $mask) === 0) {
                return false;
            }
        }

        return true;
    }

    public function sizeBits(): int
    {
        return $this->sizeBits;
    }

    public function hashCount(): int
    {
        return $this->hashCount;
    }

    public function byteSize(): int
    {
        return strlen($this->bits);
    }

    public function exportBits(): string
    {
        return $this->bits;
    }

    public function importBits(string $bits): void
    {
        if (strlen($bits) !== $this->byteSize()) {
            return;
        }

        $this->bits = $bits;
    }

    public function clear(): void
    {
        $this->bits = str_repeat("\0", $this->byteSize());
    }

    /**
     * @return list<int>
     */
    private function positions(string $value): array
    {
        $positions = [];
        $hash1 = $this->unsignedCrc32($value);
        $hash2 = $this->unsignedCrc32('bloom:' . $value) | 1;

        for ($index = 0; $index < $this->hashCount; $index++) {
            $positions[] = ($hash1 + ($index * $hash2)) % $this->sizeBits;
        }

        return $positions;
    }

    private function unsignedCrc32(string $value): int
    {
        $hash = crc32($value);

        return $hash < 0 ? $hash + self::UINT32_SIZE : $hash;
    }
}
