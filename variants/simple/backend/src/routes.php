<?php

declare(strict_types=1);

use App\Handler\CreateHandler;
use App\Handler\RedirectHandler;
use Slim\App;

return function (App $app): void {
    $app->post('/api/aliases', CreateHandler::class);
    $app->get('/{alias:[A-Za-z0-9_-]+}', RedirectHandler::class);
};
