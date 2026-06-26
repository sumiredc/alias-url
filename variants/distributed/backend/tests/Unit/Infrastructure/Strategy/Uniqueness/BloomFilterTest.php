<?php

declare(strict_types=1);

use Alias\Distributed\Infrastructure\Strategy\Uniqueness\BloomFilter;

it('detects an added value as possibly existing', function (): void {
    $filter = new BloomFilter(sizeBits: 1024, hashCount: 3);

    $filter->add('summer');

    expect($filter->mightContain('summer'))->toBeTrue();
});

it('detects an untouched value as not existing', function (): void {
    $filter = new BloomFilter(sizeBits: 1024, hashCount: 3);

    $filter->add('summer');

    expect($filter->mightContain('winter'))->toBeFalse();
});
