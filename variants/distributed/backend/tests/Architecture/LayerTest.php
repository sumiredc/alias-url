<?php

declare(strict_types=1);

arch('domain does not depend on application or outer layers')
    ->expect('Alias\Distributed\Domain')
    ->not->toUse([
        'Alias\Distributed\Application',
        'Alias\Distributed\Infrastructure',
        'Alias\Distributed\InterfaceAdapter',
    ]);

arch('application does not depend on outer layers')
    ->expect('Alias\Distributed\Application')
    ->not->toUse([
        'Alias\Distributed\Infrastructure',
        'Alias\Distributed\InterfaceAdapter',
    ]);

arch('infrastructure does not depend on interface adapters')
    ->expect('Alias\Distributed\Infrastructure')
    ->not->toUse('Alias\Distributed\InterfaceAdapter');

arch('interface adapters do not depend on infrastructure')
    ->expect('Alias\Distributed\InterfaceAdapter')
    ->not->toUse('Alias\Distributed\Infrastructure');

arch('distributed source uses strict types')
    ->expect('Alias\Distributed')
    ->toUseStrictTypes();
