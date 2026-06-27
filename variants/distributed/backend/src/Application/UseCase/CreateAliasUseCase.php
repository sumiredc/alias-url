<?php

declare(strict_types=1);

namespace Alias\Distributed\Application\UseCase;

use Alias\Distributed\Application\Port\AliasRepository;
use Alias\Distributed\Application\Port\AliasUniquenessGuard;
use Alias\Distributed\Application\Validator\CreateAliasValidator;
use Alias\Distributed\Domain\Alias\Exception\AliasAlreadyExistsException;

final class CreateAliasUseCase
{
    public function __construct(
        private AliasRepository $aliasRepository,
        private CreateAliasValidator $validator,
        private AliasUniquenessGuard $aliasUniquenessGuard,
    ) {
    }

    public function execute(string $url, string $alias, string $shortUrlBaseUrl): CreateAliasResult
    {
        $url = trim($url);
        $alias = trim($alias);

        $validationErrors = $this->validator->validate($url, $alias);

        if ($validationErrors !== []) {
            throw new ValidationFailedException($validationErrors);
        }

        if ($this->aliasUniquenessGuard->mightContain($alias)) {
            throw new AliasAlreadyExistsException(
                'This short name might already be used.',
                AliasAlreadyExistsException::REASON_ALIAS_MIGHT_EXIST,
            );
        }

        if (!$this->aliasRepository->create($alias, $url)) {
            $this->aliasUniquenessGuard->add($alias);

            throw new AliasAlreadyExistsException(
                'This short name is already used.',
                AliasAlreadyExistsException::REASON_ALIAS_EXISTS,
            );
        }

        $this->aliasUniquenessGuard->add($alias);

        return new CreateAliasResult(
            alias: $alias,
            url: $url,
            shortUrl: sprintf('%s/%s', rtrim($shortUrlBaseUrl, '/'), $alias),
        );
    }
}
