<?php

declare(strict_types=1);

namespace Alias\Simple\Infrastructure\Persistence\MySql;

use Alias\Simple\Application\Port\AliasRepository;
use PDO;
use PDOException;

final class MySqlAliasRepository implements AliasRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function create(string $alias, string $url): bool
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO aliases (alias, url) VALUES (:alias, :url)'
        );

        try {
            $statement->execute([
                'alias' => $alias,
                'url' => $url,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === SqlState::INTEGRITY_CONSTRAINT_VIOLATION) {
                return false;
            }

            throw $exception;
        }

        return true;
    }

    /**
     * @return array{id: int|string, alias: string, url: string, created_at: string, updated_at: string}|null
     */
    public function findByAlias(string $alias): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, alias, url, created_at, updated_at FROM aliases WHERE alias = :alias LIMIT 1'
        );

        $statement->execute([
            'alias' => $alias,
        ]);

        $row = $statement->fetch();

        if (!is_array($row)) {
            return null;
        }

        $id = $row['id'] ?? null;
        $storedAlias = $row['alias'] ?? null;
        $url = $row['url'] ?? null;
        $createdAt = $row['created_at'] ?? null;
        $updatedAt = $row['updated_at'] ?? null;

        if (
            !(is_int($id) || is_string($id))
            || !is_string($storedAlias)
            || !is_string($url)
            || !is_string($createdAt)
            || !is_string($updatedAt)
        ) {
            return null;
        }

        return [
            'id' => $id,
            'alias' => $storedAlias,
            'url' => $url,
            'created_at' => $createdAt,
            'updated_at' => $updatedAt,
        ];
    }

    public function exists(string $alias): bool
    {
        return $this->findByAlias($alias) !== null;
    }
}
