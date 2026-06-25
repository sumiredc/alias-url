<?php

declare(strict_types=1);

use DI\ContainerBuilder;
use Symfony\Component\Validator\Validation;
use Symfony\Component\Validator\Validator\ValidatorInterface;

$builder = new ContainerBuilder();

$env = static function (string $key, string $default): string {
    $value = $_ENV[$key] ?? $default;

    return is_string($value) ? $value : $default;
};

$builder->addDefinitions([
    PDO::class => function () use ($env): PDO {
        $host = $env('DB_HOST', 'mysql');
        $port = $env('DB_PORT', '3306');
        $database = $env('DB_DATABASE', 'alias_url');
        $username = $env('DB_USERNAME', 'user');
        $password = $env('DB_PASSWORD', 'password');

        return new PDO(
            "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
            $username,
            $password,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ],
        );
    },
    ValidatorInterface::class => function (): ValidatorInterface {
        return Validation::createValidator();
    },
]);

return $builder->build();
