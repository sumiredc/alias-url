<?php

declare(strict_types=1);

use App\Middleware\CorsMiddleware;
use Dotenv\Dotenv;
use Psr\Container\ContainerInterface;
use Slim\Factory\AppFactory;
use Slim\Factory\ServerRequestCreatorFactory;
use Slim\ResponseEmitter;

const DEFAULT_WORKER_MAX_REQUESTS = 10000;

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

/** @var ContainerInterface $container */
$container = require __DIR__ . '/dependencies.php';

AppFactory::setContainer($container);
$app = AppFactory::create();

$registerRoutes = require __DIR__ . '/routes.php';
$registerRoutes($app);

$app->addBodyParsingMiddleware();

$isDebug = ($_ENV['APP_ENV'] ?? 'production') !== 'production';
$app->addErrorMiddleware($isDebug, true, true);
$app->add(new CorsMiddleware(corsAllowedOrigins()));

$nbRequests = 0;
$workerMaxRequests = workerMaxRequests();

while (frankenphp_handle_request(function () use ($app, &$nbRequests) {
    $nbRequests++;

    $serverRequestCreator = ServerRequestCreatorFactory::create();
    $request = $serverRequestCreator->createServerRequestFromGlobals();

    $response = $app->handle($request);

    $emitter = new ResponseEmitter();
    $emitter->emit($response);
})) {
    if ($nbRequests >= $workerMaxRequests) {
        break;
    }
}

function workerMaxRequests(): int
{
    $value = $_ENV['WORKER_MAX_REQUESTS'] ?? DEFAULT_WORKER_MAX_REQUESTS;
    $maxRequests = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    return is_int($maxRequests) ? $maxRequests : DEFAULT_WORKER_MAX_REQUESTS;
}

/**
 * @return list<string>
 */
function corsAllowedOrigins(): array
{
    $value = $_ENV['CORS_ALLOW_ORIGIN'] ?? '*';
    $originList = is_string($value) ? $value : '*';
    $origins = array_map('trim', explode(',', $originList));
    $origins = array_values(array_filter($origins, static fn (string $origin): bool => $origin !== ''));

    return $origins === [] ? ['*'] : $origins;
}
