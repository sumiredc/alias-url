<?php

declare(strict_types=1);

namespace Alias\Distributed\Application\Port;

interface AliasUniquenessGuard
{
    public function mightContain(string $alias): bool;

    public function add(string $alias): void;
}
