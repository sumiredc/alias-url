<?php

declare(strict_types=1);

namespace Alias\Simple\InterfaceAdapter\Http\Handler;

use Alias\Simple\Domain\Alias\Exception\AliasNotFoundException;
use Alias\Simple\Application\UseCase\ResolveAliasUseCase;
use Fig\Http\Message\StatusCodeInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class RedirectHandler
{
    public function __construct(
        private ResolveAliasUseCase $resolveAliasUseCase,
    ) {
    }

    /**
     * @param array<string, string> $args
     */
    public function __invoke(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $alias = (string) ($args['alias'] ?? '');

        try {
            $url = $this->resolveAliasUseCase->execute($alias);
        } catch (AliasNotFoundException $exception) {
            $response->getBody()->write($exception->getMessage());

            return $response
                ->withHeader('Content-Type', 'text/plain')
                ->withStatus(StatusCodeInterface::STATUS_NOT_FOUND);
        }

        return $response
            ->withHeader('Location', $url)
            ->withStatus(StatusCodeInterface::STATUS_FOUND);
    }
}
