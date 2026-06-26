<?php

declare(strict_types=1);

arch('domain does not depend on application or outer layers')
    ->expect('Alias\Simple\Domain')
    ->not->toUse([
        'Alias\Simple\Application',
        'Alias\Simple\Infrastructure',
        'Alias\Simple\InterfaceAdapter',
    ]);

arch('application does not depend on outer layers')
    ->expect('Alias\Simple\Application')
    ->not->toUse([
        'Alias\Simple\Infrastructure',
        'Alias\Simple\InterfaceAdapter',
    ]);

arch('infrastructure does not depend on interface adapters')
    ->expect('Alias\Simple\Infrastructure')
    ->not->toUse('Alias\Simple\InterfaceAdapter');

arch('interface adapters do not depend on infrastructure')
    ->expect('Alias\Simple\InterfaceAdapter')
    ->not->toUse('Alias\Simple\Infrastructure');

arch('simple source uses strict types')
    ->expect('Alias\Simple')
    ->toUseStrictTypes();
