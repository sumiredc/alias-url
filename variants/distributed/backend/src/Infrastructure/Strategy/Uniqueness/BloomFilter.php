<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Strategy\Uniqueness;

final class BloomFilter
{
    private const UINT32_SIZE = 4_294_967_296;

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

    public function reset(): void
    {
        $this->bits = str_repeat("\0", strlen($this->bits));
    }

    /**
     * @return list<int>
     */
    private function positions(string $value): array
    {
        $positions = [];

        for ($index = 0; $index < $this->hashCount; $index++) {
            $hash = crc32($index . ':' . $value);
            $unsignedHash = $hash < 0 ? $hash + self::UINT32_SIZE : $hash;
            $positions[] = $unsignedHash % $this->sizeBits;
        }

        return $positions;
    }
}
