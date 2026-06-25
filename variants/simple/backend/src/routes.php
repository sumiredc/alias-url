<?php

declare(strict_types=1);

use App\Handler\CreateHandler;
use App\Handler\RedirectHandler;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

return function (App $app): void {
    $app->get('/health', static function (ServerRequestInterface $_request, ResponseInterface $response): ResponseInterface {
        $response->getBody()->write(json_encode(['status' => 'ok'], JSON_THROW_ON_ERROR));

        return $response->withHeader('Content-Type', 'application/json');
    });

    $app->post('/api/aliases', CreateHandler::class);
    $app->get('/{alias:[A-Za-z0-9_-]+}', RedirectHandler::class);
};
