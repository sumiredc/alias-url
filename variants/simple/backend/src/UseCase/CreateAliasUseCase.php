<?php

declare(strict_types=1);

namespace App\UseCase;

use App\Database\SqlState;
use App\Exception\AliasAlreadyExistsException;
use App\Exception\ValidationFailedException;
use App\Repository\AliasRepository;
use App\Validator\CreateAliasValidator;
use PDOException;

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

        try {
            $this->aliasRepository->create($alias, $url);
        } catch (PDOException $exception) {
            if ($exception->getCode() === SqlState::INTEGRITY_CONSTRAINT_VIOLATION) {
                throw new AliasAlreadyExistsException('This short name is already used.', 0, $exception);
            }

            throw $exception;
        }

        return new CreateAliasResult(
            alias: $alias,
            url: $url,
            shortUrl: sprintf('%s/%s', rtrim($shortUrlBaseUrl, '/'), $alias),
        );
    }
}
