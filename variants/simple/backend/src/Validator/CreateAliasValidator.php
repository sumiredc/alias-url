<?php

declare(strict_types=1);

namespace App\Validator;

use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

final class CreateAliasValidator
{
    private const RESERVED_ALIASES = [
        'api',
        'health',
    ];

    public function __construct(
        private ValidatorInterface $validator,
    ) {
    }

    /**
     * @return array<string, list<string>>
     */
    public function validate(string $url, string $alias): array
    {
        $violations = $this->validator->validate([
            'url' => $url,
            'alias' => $alias,
        ], new Assert\Collection([
            'url' => [
                new Assert\NotBlank(message: 'URL is required.'),
                new Assert\Url(
                    protocols: ['http', 'https'],
                    message: 'URL must be a valid http or https URL.',
                ),
            ],
            'alias' => [
                new Assert\NotBlank(message: 'Short name is required.'),
                new Assert\Length(
                    max: 255,
                    maxMessage: 'Short name must be 255 characters or less.',
                ),
                new Assert\Regex(
                    pattern: '/\A[A-Za-z0-9_-]+\z/',
                    message: 'Short name can only contain letters, numbers, underscores, and hyphens.',
                ),
            ],
        ]));

        $errors = [];

        foreach ($violations as $violation) {
            $field = trim($violation->getPropertyPath(), '[]');
            $field = $field === '' ? 'body' : $field;

            $errors[$field][] = (string) $violation->getMessage();
        }

        if (in_array(strtolower($alias), self::RESERVED_ALIASES, true)) {
            $errors['alias'][] = 'This short name is reserved.';
        }

        return $errors;
    }
}
