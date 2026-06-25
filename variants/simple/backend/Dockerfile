FROM dunglas/frankenphp:php8.5

RUN install-php-extensions pdo_mysql

COPY gateway/Caddyfile /etc/frankenphp/Caddyfile
