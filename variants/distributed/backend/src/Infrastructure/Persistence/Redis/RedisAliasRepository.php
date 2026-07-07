<?php

declare(strict_types=1);

namespace Alias\Distributed\Infrastructure\Persistence\Redis;

use Alias\Distributed\Application\Port\AliasRepository;

final class RedisAliasRepository implements AliasRepository
{
    public function __construct(
        private RedisClientProvider $clientProvider,
    ) {
    }

    public function create(string $alias, string $url): bool
    {
        $client = $this->clientProvider->cluster();

        $result = $client->rawCommand($this->key($alias), 'SET', $this->key($alias), $url, 'NX');

        return $result === true || $result === 'OK';
    }

    /**
     * @return array{alias: string, url: string}|null
     */
    public function findByAlias(string $alias): ?array
    {
        $client = $this->clientProvider->cluster();
        $payload = $client->get($this->key($alias));

        if (!is_string($payload) || $payload === '') {
            return null;
        }

        return [
            'alias' => $alias,
            'url' => $payload,
        ];
    }

    private function key(string $alias): string
    {
        return $alias;
    }
}
