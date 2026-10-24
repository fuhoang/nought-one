<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    public function test_application_health_endpoint_returns_success(): void
    {
        $response = $this->get('/up');

        $response->assertOk();
    }
}
