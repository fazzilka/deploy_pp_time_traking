#!/usr/bin/env bash
set -euo pipefail

cd /opt/time-tracking

git pull --ff-only

docker compose -f docker-compose.prod.yml --env-file .env up -d --build

docker image prune -f

docker compose -f docker-compose.prod.yml --env-file .env ps