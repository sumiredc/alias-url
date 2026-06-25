<?php

declare(strict_types=1);

namespace App\Exception;

use RuntimeException;

final class ValidationFailedException extends RuntimeException
{
    /**
     * @param array<string, list<string>> $errors
     */
    public function __construct(private array $errors)
    {
        parent::__construct('Validation failed.');
    }

    /**
     * @return array<string, list<string>>
     */
    public function errors(): array
    {
        return $this->errors;
    }
}
