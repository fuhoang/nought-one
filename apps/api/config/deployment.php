<?php

return [
    'force_public_url' => (bool) env('FORCE_PUBLIC_URL', false),
    'trusted_proxies' => env('TRUSTED_PROXIES', ''),
];
