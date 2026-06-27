<?php

declare(strict_types=1);

namespace Alias\Distributed\Domain\Alias\Exception;

use RuntimeException;

final class AliasAlreadyExistsException extends RuntimeException
{
    public const REASON_ALIAS_EXISTS = 'alias_exists';
    public const REASON_ALIAS_MIGHT_EXIST = 'alias_might_exist';

    public function __construct(
        string $message = 'This short name is already used.',
        private readonly string $reason = self::REASON_ALIAS_EXISTS,
    ) {
        parent::__construct($message);
    }

    public function reason(): string
    {
        return $this->reason;
    }
}
