<?php
declare(strict_types=1);

$markup = file_get_contents(__DIR__ . '/index.html');
if ($markup === false || !preg_match('~<script>.*?</script>~s', $markup)) {
    http_response_code(500);
    exit('Интерфейси барнома ёфт нашуд.');
}
$markup = preg_replace('~<script>.*?</script>~s', '<script src="app.js" defer></script>', $markup, 1);
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($requestPath === '/admin' || $requestPath === '/admin/') {
    $markup = preg_replace('~<head(?:\s[^>]*)?>~i', '$0' . "\n<base href=\"/\">", $markup, 1);
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo $markup;
