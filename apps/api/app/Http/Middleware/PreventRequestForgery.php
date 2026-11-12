<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery as BasePreventRequestForgery;
use Symfony\Component\HttpFoundation\Cookie;

class PreventRequestForgery extends BasePreventRequestForgery
{
    protected function newCookie($request, $config): Cookie
    {
        $cookie = parent::newCookie($request, $config);

        return new Cookie(
            config('session.csrf_cookie', 'XSRF-TOKEN'),
            $cookie->getValue(),
            $cookie->getExpiresTime(),
            $cookie->getPath(),
            $cookie->getDomain(),
            $cookie->isSecure(),
            $cookie->isHttpOnly(),
            $cookie->isRaw(),
            $cookie->getSameSite(),
            $cookie->isPartitioned(),
        );
    }

    protected function addCookieToResponse($request, $response)
    {
        $response = parent::addCookieToResponse($request, $response);

        if ($request->is('sanctum/csrf-cookie')) {
            $response->headers->set('X-CSRF-Cookie-Name', config('session.csrf_cookie', 'XSRF-TOKEN'));
            $response->headers->set('Cache-Control', 'private, no-store');
        }

        return $response;
    }
}
