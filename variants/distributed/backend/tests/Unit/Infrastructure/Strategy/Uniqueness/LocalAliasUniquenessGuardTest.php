<?php

declare(strict_types=1);

use Alias\Distributed\Infrastructure\Strategy\Uniqueness\BloomFilter;
use Alias\Distributed\Infrastructure\Strategy\Uniqueness\LocalAliasUniquenessGuard;

it('keeps one character aliases in the exact set', function (): void {
    $guard = new LocalAliasUniquenessGuard(
        bloomFilter: new BloomFilter(sizeBits: 1024, hashCount: 3),
    );

    $guard->add('a');

    expect($guard->mightContain('a'))->toBeFalse();

    $guard->flushIfNeeded();

    expect($guard->mightContain('a'))->toBeTrue();
});

it('keeps longer aliases in the bloom filter', function (): void {
    $guard = new LocalAliasUniquenessGuard(
        bloomFilter: new BloomFilter(sizeBits: 1024, hashCount: 3),
    );

    $guard->add('ab');

    expect($guard->mightContain('ab'))->toBeFalse();

    $guard->flushIfNeeded();

    expect($guard->mightContain('ab'))->toBeTrue();
});
