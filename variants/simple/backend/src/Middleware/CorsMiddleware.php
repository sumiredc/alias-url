<?php

declare(strict_types=1);

namespace App\Middleware;

use Fig\Http\Message\StatusCodeInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

final class CorsMiddleware implements MiddlewareInterface
{
    private const ALLOWED_METHODS = 'GET, POST, OPTIONS';
    private const ALLOWED_HEADERS = 'Content-Type, Authorization';

    /**
     * @param list<string> $allowedOrigins
     */
    public function __construct(
        private array $allowedOrigins,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($request->getMethod() === 'OPTIONS') {
            return $this->withCorsHeaders(new Response(StatusCodeInterface::STATUS_NO_CONTENT), $request);
        }

        return $this->withCorsHeaders($handler->handle($request), $request);
    }

    private function withCorsHeaders(ResponseInterface $response, ServerRequestInterface $request): ResponseInterface
    {
        $origin = $request->getHeaderLine('Origin');
        $allowedOrigin = $this->allowedOrigin($origin);

        if ($allowedOrigin === null) {
            return $response;
        }

        $response = $response
            ->withHeader('Access-Control-Allow-Origin', $allowedOrigin)
            ->withHeader('Access-Control-Allow-Methods', self::ALLOWED_METHODS)
            ->withHeader('Access-Control-Allow-Headers', self::ALLOWED_HEADERS)
            ->withHeader('Access-Control-Max-Age', '86400');

        if ($allowedOrigin !== '*') {
            $response = $response->withHeader('Vary', 'Origin');
        }

        return $response;
    }

    private function allowedOrigin(string $origin): ?string
    {
        if (in_array('*', $this->allowedOrigins, true)) {
            return '*';
        }

        if ($origin !== '' && in_array($origin, $this->allowedOrigins, true)) {
            return $origin;
        }

        return null;
    }
}
