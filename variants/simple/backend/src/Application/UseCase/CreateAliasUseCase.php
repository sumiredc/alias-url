<?php

declare(strict_types=1);

namespace Alias\Simple\Application\UseCase;

use Alias\Simple\Application\Port\AliasRepository;
use Alias\Simple\Application\Validator\CreateAliasValidator;
use Alias\Simple\Domain\Alias\Exception\AliasAlreadyExistsException;

final class CreateAliasUseCase
{
    public function __construct(
        private AliasRepository $aliasRepository,
        private CreateAliasValidator $validator,
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

        if ($this->aliasRepository->exists($alias)) {
            throw new AliasAlreadyExistsException('This short name is already used.');
        }

        if (!$this->aliasRepository->create($alias, $url)) {
            throw new AliasAlreadyExistsException('This short name is already used.');
        }

        return new CreateAliasResult(
            alias: $alias,
            url: $url,
            shortUrl: sprintf('%s/%s', rtrim($shortUrlBaseUrl, '/'), $alias),
        );
    }
}
