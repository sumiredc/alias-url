<?php

declare(strict_types=1);

namespace App\UseCase;

use App\Exception\AliasNotFoundException;
use App\Repository\AliasRepository;

final class ResolveAliasUseCase
{
    public function __construct(
        private AliasRepository $aliasRepository,
    ) {
    }

    public function execute(string $alias): string
    {
        $record = $this->aliasRepository->findByAlias($alias);

        if ($record === null) {
            throw new AliasNotFoundException('Alias was not found.');
        }

        return $record['url'];
    }
}
