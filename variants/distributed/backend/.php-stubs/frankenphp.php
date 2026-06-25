<?php

declare(strict_types=1);

if (!function_exists('frankenphp_handle_request')) {
    /**
     * @param callable(): void $handler
     */
    function frankenphp_handle_request(callable $handler): bool
    {
        return false;
    }
}
