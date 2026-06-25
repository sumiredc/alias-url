<?php

declare(strict_types=1);

namespace Alias\Distributed\Application\UseCase;

use Alias\Distributed\Application\Port\AliasRepository;
use Alias\Distributed\Domain\Alias\Exception\AliasNotFoundException;

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
