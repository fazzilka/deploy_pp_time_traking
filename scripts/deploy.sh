#!/usr/bin/env bash
set -euo pipefail

cd /opt/time-tracking

git pull --ff-only
cp -n .env.prod.example .env || true

echo "Проверь .env перед первым запуском: пароли, JWT_SECRET_KEY, CORS_ALLOW_ORIGINS"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

docker compose -f docker-compose.prod.yml --env-file .env ps
