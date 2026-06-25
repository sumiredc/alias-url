<?php

declare(strict_types=1);

namespace Alias\Distributed\Application\UseCase;

final readonly class CreateAliasResult
{
    public function __construct(
        public string $alias,
        public string $url,
        public string $shortUrl,
    ) {
    }
}
