<?php

declare(strict_types=1);

namespace Alias\Distributed\Application\Port;

interface AliasRepository
{
    public function create(string $alias, string $url): bool;
}
