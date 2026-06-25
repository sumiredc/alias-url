<?php

declare(strict_types=1);

namespace Alias\Simple\Application\UseCase;

use Alias\Simple\Domain\Alias\Exception\AliasNotFoundException;
use Alias\Simple\Application\Port\AliasRepository;

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
