<?php

declare(strict_types=1);

namespace Alias\Simple\Application\Port;

interface AliasRepository
{
    public function create(string $alias, string $url): bool;

    /**
     * @return array{id: int|string, alias: string, url: string, created_at: string, updated_at: string}|null
     */
    public function findByAlias(string $alias): ?array;

    public function exists(string $alias): bool;
}
