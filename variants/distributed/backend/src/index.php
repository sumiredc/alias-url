<?php

declare(strict_types=1);

const WORKER_MAX_REQUESTS = 10000;
const DEFAULT_LOCAL_FILTER_ROTATE_SECONDS = 86400;

$handler = static function (): void {
    $path = parse_url(requestUri(), PHP_URL_PATH);

    if ($path === '/health') {
        http_response_code(200);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode([
            'status' => 'ok',
            'local_filter_rotate_seconds' => localFilterRotateSeconds(),
        ], JSON_THROW_ON_ERROR);

        return;
    }

    http_response_code(501);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'distributed backend is not implemented yet';
};

if (!function_exists('frankenphp_handle_request')) {
    $handler();

    return;
}

for ($requestCount = 0; $requestCount < WORKER_MAX_REQUESTS; $requestCount++) {
    frankenphp_handle_request($handler);
}

function requestUri(): string
{
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/';

    return is_string($requestUri) ? $requestUri : '/';
}

function localFilterRotateSeconds(): int
{
    $value = $_ENV['LOCAL_FILTER_ROTATE_SECONDS'] ?? DEFAULT_LOCAL_FILTER_ROTATE_SECONDS;
    $rotateSeconds = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    return is_int($rotateSeconds) ? $rotateSeconds : DEFAULT_LOCAL_FILTER_ROTATE_SECONDS;
}
