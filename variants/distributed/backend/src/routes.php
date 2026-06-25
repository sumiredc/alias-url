<?php

declare(strict_types=1);

use Alias\Distributed\InterfaceAdapter\Http\Handler\CreateHandler;
use Fig\Http\Message\StatusCodeInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;

return function (App $app): void {
    $app->get('/health', static function (ServerRequestInterface $_request, ResponseInterface $response): ResponseInterface {
        $response->getBody()->write(json_encode(['status' => 'ok'], JSON_THROW_ON_ERROR));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(StatusCodeInterface::STATUS_OK);
    });

    $app->post('/api/aliases', CreateHandler::class);
};
