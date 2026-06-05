# Production deploy на VPS

## 1. Сервер

Для проекта достаточно VPS с Ubuntu 22.04/24.04 LTS.

Минимально для 30-40 одновременных пользователей:
- 2 vCPU;
- 4 GB RAM;
- 30 GB SSD;
- публичный IPv4;
- доступ по SSH.

Лучше брать сервер в РФ или ближайшем регионе, если пользователи находятся в РФ.

## 2. Подключение по SSH

Подключись к серверу:

```bash
ssh root@SERVER_IP_OR_DOMAIN
```

Если SSH работает на нестандартном порту:

```bash
ssh -p 22 root@SERVER_IP_OR_DOMAIN
```

## 3. Первичная настройка сервера

Скопируй репозиторий на сервер или сначала установи зависимости вручную. Скрипт первичной настройки рассчитан на Ubuntu и ставит Docker, Docker Compose plugin, Git и базовый firewall:

```bash
sudo bash scripts/first_server_setup.sh
```

Скрипт открывает SSH и порт `80/tcp`. Grafana, Prometheus и Loki в production compose привязаны к `127.0.0.1`, поэтому наружу не открываются.

## 4. Клонирование проекта

На сервере:

```bash
mkdir -p /opt
cd /opt
git clone <URL_РЕПОЗИТОРИЯ> time-tracking
cd /opt/time-tracking
```

Если репозиторий уже склонирован:

```bash
cd /opt/time-tracking
git pull --ff-only
```

## 5. Production env

Создай `.env` из шаблона:

```bash
cp .env.prod.example .env
nano .env
```

Обязательно замени:
- `POSTGRES_PASSWORD`;
- `JWT_SECRET_KEY`;
- `ADMIN_PASSWORD`;
- `GRAFANA_ADMIN_PASSWORD`;
- `CORS_ALLOW_ORIGINS`.

Пример для сервера без домена:

```env
CORS_ALLOW_ORIGINS=http://SERVER_IP_OR_DOMAIN
```

Пример для домена:

```env
CORS_ALLOW_ORIGINS=https://example.ru
```

Не коммить `.env`. Он игнорируется git.

## 6. Запуск production

Из корня проекта:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Проверить контейнеры:

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
```

## 7. Проверка health и frontend

Backend health через nginx:

```bash
curl http://SERVER_IP_OR_DOMAIN/health
```

Ожидается JSON-ответ health endpoint.

Frontend:

```text
http://SERVER_IP_OR_DOMAIN/
```

API в production вызывается frontend-ом через относительные `/api/...`, nginx проксирует эти запросы в `backend:8000`.

## 8. Grafana через SSH tunnel

Grafana не открыта наружу. Подними SSH tunnel с локального компьютера:

```bash
ssh -L 3000:127.0.0.1:3000 root@SERVER_IP_OR_DOMAIN
```

После этого открой локально:

```text
http://localhost:3000
```

Логин:

```text
admin
```

Пароль берётся из `.env`:

```env
GRAFANA_ADMIN_PASSWORD=...
```

Provisioning автоматически добавляет datasource Prometheus и Loki, а также dashboards `Time Tracking Overview` и `Time Tracking Observability`.

## 9. Prometheus и Loki

Prometheus доступен только через localhost сервера:

```bash
ssh -L 9090:127.0.0.1:9090 root@SERVER_IP_OR_DOMAIN
```

Затем:

```text
http://localhost:9090
```

Prometheus собирает backend metrics:

```text
backend:8000/metrics
```

Также Prometheus собирает PostgreSQL metrics через `postgres-exporter:9187` и container metrics через `cadvisor:8080`. Loki доступен внутри docker network и подключён к Grafana как datasource. Promtail читает Docker logs из `/var/lib/docker/containers`.

## 10. Логи

Все сервисы:

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f
```

Только backend:

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f backend
```

Только frontend/nginx:

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f frontend
```

## 11. Перезапуск и обновление

Обновление с пересборкой:

```bash
cd /opt/time-tracking
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker image prune -f
```

Остановка:

```bash
docker compose -f docker-compose.prod.yml --env-file .env down
```

Остановка без удаления volume не удаляет данные PostgreSQL.

## 12. Backup PostgreSQL

Создать backup:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres pg_dump -U postgres -d time_tracking > backup_time_tracking.sql
```

Если в `.env` изменены `POSTGRES_USER` или `POSTGRES_DB`, подставь свои значения.

Сжать backup:

```bash
gzip backup_time_tracking.sql
```

## 13. Restore PostgreSQL

Перед восстановлением останови backend, чтобы не было параллельных записей:

```bash
docker compose -f docker-compose.prod.yml --env-file .env stop backend
```

Восстановить из SQL:

```bash
cat backup_time_tracking.sql | docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres psql -U postgres -d time_tracking
```

Запустить backend:

```bash
docker compose -f docker-compose.prod.yml --env-file .env start backend
```

## 14. CI/CD GitHub Actions

Workflow находится в:

```text
.github/workflows/deploy.yml
```

Он запускается при push в `main` и выполняет на сервере:

```bash
cd /opt/time-tracking
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker image prune -f
```

Добавь secrets:
- `SERVER_HOST` — IP или домен сервера;
- `SERVER_USER` — пользователь SSH;
- `SERVER_SSH_KEY` — приватный SSH key для доступа к серверу;
- `SERVER_PORT` — SSH port, обычно `22`.

## 15. CI/CD GitFlic

Файл:

```text
gitflic-ci.yaml
```

Ожидаемые переменные:
- `SERVER_IP`;
- `SERVER_USER`;
- `SSH_PORT`;
- `SSH_KEY`.

Команда деплоя такая же:

```bash
cd /opt/time-tracking
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker image prune -f
```

## 16. Локальная проверка production config

Из корня проекта:

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml --env-file .env.prod.example config
```

Для полной сборки production-образов нужны сетевой доступ к Docker registry и npm registry:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Без реальных production-секретов автоматически запускать production deploy не нужно.
