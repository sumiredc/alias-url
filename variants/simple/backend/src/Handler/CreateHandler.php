<?php

declare(strict_types=1);

namespace App\Handler;

use App\Exception\AliasAlreadyExistsException;
use App\Exception\ValidationFailedException;
use App\UseCase\CreateAliasUseCase;
use Fig\Http\Message\StatusCodeInterface;
use JsonException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class CreateHandler
{
    public function __construct(
        private CreateAliasUseCase $createAliasUseCase,
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
        $payload = $request->getParsedBody();

        if (!is_array($payload)) {
            return $this->json($response, ['message' => 'JSON body is required.'], StatusCodeInterface::STATUS_BAD_REQUEST);
        }

        $url = trim((string) ($payload['url'] ?? ''));
        $alias = trim((string) ($payload['alias'] ?? ''));

        try {
            $result = $this->createAliasUseCase->execute(
                url: $url,
                alias: $alias,
                shortUrlBaseUrl: $this->shortUrlBaseUrl($request),
            );
        } catch (ValidationFailedException $exception) {
            return $this->json($response, [
                'message' => 'Validation failed.',
                'errors' => $exception->errors(),
            ], StatusCodeInterface::STATUS_BAD_REQUEST);
        } catch (AliasAlreadyExistsException $exception) {
            return $this->json($response, ['message' => $exception->getMessage()], StatusCodeInterface::STATUS_CONFLICT);
        }

        return $this->json($response, [
            'alias' => $result->alias,
            'url' => $result->url,
            'shortUrl' => $result->shortUrl,
        ], StatusCodeInterface::STATUS_CREATED);
    }

    /**
     * @param array<string, mixed> $payload
     *
     * @throws JsonException
     */
    private function json(ResponseInterface $response, array $payload, int $status): ResponseInterface
    {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    }

    private function shortUrlBaseUrl(ServerRequestInterface $request): string
    {
        $appUrlValue = $_ENV['APP_URL'] ?? '';
        $appUrl = is_string($appUrlValue) ? rtrim($appUrlValue, '/') : '';

        if ($appUrl !== '') {
            return $appUrl;
        }

        $uri = $request->getUri();

        return "{$uri->getScheme()}://{$uri->getAuthority()}";
    }
}
