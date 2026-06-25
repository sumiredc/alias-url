<?php

declare(strict_types=1);

namespace Alias\Simple\Infrastructure\Persistence\MySql;

final class SqlState
{
    public const INTEGRITY_CONSTRAINT_VIOLATION = '23000';

    private function __construct()
    {
    }
}
