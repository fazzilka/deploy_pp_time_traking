#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/time-tracking}"
ENV_FILE="${ENV_FILE:-.env}"

COMPOSE_FILE=""
BACKUP_DIR=""
HEALTH_TIMEOUT_SECONDS=""
HEALTH_INTERVAL_SECONDS=""
BACKEND_HEALTH_URL=""
FRONTEND_HEALTH_URL=""
RUN_DB_BACKUP=""
RUN_MIGRATIONS=""
PRUNE_AFTER_SUCCESS=""
BACKUP_RETENTION_DAYS=""
FORCE_DEPLOY_FAIL_AFTER_UP=""

DEPLOY_SUCCEEDED=false
ROLLBACK_IN_PROGRESS=false
ROLLBACK_ALLOWED=false
PREVIOUS_COMMIT=""
PREVIOUS_BRANCH=""
NEW_COMMIT=""
DEPLOY_STARTED_AT=""
BACKUP_FILE=""

log() {
  printf '[deploy] %s\n' "$*"
}

warn() {
  printf '[deploy][warn] %s\n' "$*" >&2
}

error() {
  printf '[deploy][error] %s\n' "$*" >&2
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

run() {
  log "+ $*"
  "$@"
}

load_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    warn "Env file '$ENV_FILE' was not found. Docker Compose validation may fail."
    return 0
  fi

  local key
  local value

  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      '' | \#*)
        continue
        ;;
      COMPOSE_FILE | ENV_FILE | BACKUP_DIR | HEALTH_TIMEOUT_SECONDS | HEALTH_INTERVAL_SECONDS | BACKEND_HEALTH_URL | FRONTEND_HEALTH_URL | RUN_DB_BACKUP | RUN_MIGRATIONS | PRUNE_AFTER_SUCCESS | BACKUP_RETENTION_DAYS | FORCE_DEPLOY_FAIL_AFTER_UP)
        value="${value%$'\r'}"
        if [ -z "${!key:-}" ]; then
          printf -v "$key" '%s' "$value"
          export "$key"
        fi
        ;;
    esac
  done < "$ENV_FILE"
}

set_deploy_defaults() {
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
  BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
  HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"
  HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-5}"
  BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:8000/health}"
  FRONTEND_HEALTH_URL="${FRONTEND_HEALTH_URL:-http://127.0.0.1:8080/}"
  RUN_DB_BACKUP="${RUN_DB_BACKUP:-true}"
  RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
  PRUNE_AFTER_SUCCESS="${PRUNE_AFTER_SUCCESS:-true}"
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
  FORCE_DEPLOY_FAIL_AFTER_UP="${FORCE_DEPLOY_FAIL_AFTER_UP:-false}"
}

ensure_clean_worktree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    error "Working tree has uncommitted changes. Refusing to deploy or rollback."
    git status --short >&2
    exit 1
  fi
}

save_current_state() {
  PREVIOUS_COMMIT="$(git rev-parse HEAD)"
  PREVIOUS_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  DEPLOY_STARTED_AT="$(date -u +%Y%m%dT%H%M%SZ)"

  log "Deploy started at $DEPLOY_STARTED_AT"
  log "Previous commit: $PREVIOUS_COMMIT"
  log "Previous branch: $PREVIOUS_BRANCH"
}

backup_database() {
  if [ "$RUN_DB_BACKUP" != "true" ]; then
    warn "PostgreSQL backup skipped because RUN_DB_BACKUP=$RUN_DB_BACKUP"
    return 0
  fi

  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/postgres_${DEPLOY_STARTED_AT}_${PREVIOUS_COMMIT:0:8}.sql.gz"

  log "Creating PostgreSQL backup: $BACKUP_FILE"
  compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$BACKUP_FILE"
  log "PostgreSQL backup created"
}

pull_new_version() {
  run git fetch origin
  run git pull --ff-only
  NEW_COMMIT="$(git rev-parse HEAD)"

  if [ "$NEW_COMMIT" = "$PREVIOUS_COMMIT" ]; then
    warn "No new commit pulled. Current commit is still $NEW_COMMIT"
  else
    log "New commit: $NEW_COMMIT"
  fi
}

validate_compose() {
  log "Validating Docker Compose config"
  compose config >/dev/null
}

build_services() {
  log "Building production services"
  compose build
}

run_migrations() {
  if [ "$RUN_MIGRATIONS" != "true" ]; then
    warn "Explicit migrations skipped because RUN_MIGRATIONS=$RUN_MIGRATIONS"
    warn "Backend entrypoint may still run alembic upgrade head on container startup."
    return 0
  fi

  log "Running database migrations with the newly built backend image"
  compose run --rm --no-deps backend alembic upgrade head
}

start_services() {
  log "Starting production services"
  compose up -d --remove-orphans
}

wait_for_container_health() {
  local service="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  local cid=""
  local status=""
  local health=""

  log "Waiting for service '$service' to become healthy"

  while [ "$SECONDS" -lt "$deadline" ]; do
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    if [ -z "$cid" ]; then
      sleep "$HEALTH_INTERVAL_SECONDS"
      continue
    fi

    status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
    health="$(
      docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null || true
    )"

    case "$status" in
      running)
        if [ "$health" = "healthy" ] || [ "$health" = "no-healthcheck" ]; then
          log "Service '$service' is running with health '$health'"
          return 0
        fi
        if [ "$health" = "unhealthy" ]; then
          error "Service '$service' is unhealthy"
          return 1
        fi
        ;;
      restarting | exited | dead)
        error "Service '$service' is in bad state: $status"
        return 1
        ;;
    esac

    sleep "$HEALTH_INTERVAL_SECONDS"
  done

  error "Timed out waiting for service '$service' health"
  compose ps "$service" >&2 || true
  return 1
}

check_critical_services() {
  wait_for_container_health postgres
  wait_for_container_health backend
  wait_for_container_health frontend
}

check_optional_services() {
  local service
  local cid
  local status
  local health

  for service in postgres-exporter cadvisor prometheus loki promtail grafana; do
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    if [ -z "$cid" ]; then
      warn "Optional service '$service' is not present"
      continue
    fi

    status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
    health="$(
      docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null || true
    )"

    if [ "$status" != "running" ]; then
      warn "Optional service '$service' state is '$status'"
      continue
    fi

    if [ "$health" = "unhealthy" ]; then
      warn "Optional service '$service' health is unhealthy"
    fi
  done
}

curl_health_url() {
  local url="$1"

  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi

  curl -fsS --max-time 5 "$url" >/dev/null
}

check_backend_health() {
  log "Checking backend health"

  if curl_health_url "$BACKEND_HEALTH_URL"; then
    log "Backend health URL is reachable: $BACKEND_HEALTH_URL"
    return 0
  fi

  warn "Backend host health URL failed; checking from inside backend container"
  compose exec -T backend python -c 'import os, urllib.request; port = os.environ.get("APP_PORT", "8000"); urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5).read()' >/dev/null
}

check_frontend_health() {
  log "Checking frontend health"

  if curl_health_url "$FRONTEND_HEALTH_URL"; then
    log "Frontend health URL is reachable: $FRONTEND_HEALTH_URL"
    return 0
  fi

  warn "Frontend host health URL failed; checking from inside frontend container"
  compose exec -T frontend sh -c 'wget -qO- http://127.0.0.1/ >/dev/null'
}

print_restore_instruction() {
  if [ -z "${BACKUP_FILE:-}" ]; then
    warn "No database backup file was created during this deploy."
    return 0
  fi

  warn "If rollback fails because of database schema mismatch, restore the backup manually:"
  warn "gzip -dc '$BACKUP_FILE' | docker compose -f '$COMPOSE_FILE' --env-file '$ENV_FILE' exec -T postgres sh -c 'psql -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"'"
}

rollback_step() {
  local description="$1"
  shift

  log "$description"
  "$@"
  local status=$?
  if [ "$status" -ne 0 ]; then
    error "Rollback step failed: $description"
    return "$status"
  fi
  return 0
}

rollback() {
  local original_exit_code="${1:-1}"
  local rollback_failed=false

  if [ "$ROLLBACK_ALLOWED" != "true" ] || [ -z "${PREVIOUS_COMMIT:-}" ]; then
    error "Deploy failed before rollback became available."
    exit "$original_exit_code"
  fi

  ROLLBACK_IN_PROGRESS=true
  set +e

  error "Deploy failed. Starting rollback."
  error "Failed commit: ${NEW_COMMIT:-unknown}"
  error "Rolling back to previous working commit: $PREVIOUS_COMMIT"

  rollback_step "Resetting repository to $PREVIOUS_COMMIT" git reset --hard "$PREVIOUS_COMMIT" || rollback_failed=true

  if [ "$rollback_failed" = "false" ]; then
    rollback_step "Validating rollback Docker Compose config" validate_compose || rollback_failed=true
    rollback_step "Building previous working version" build_services || rollback_failed=true
    rollback_step "Starting previous working version" start_services || rollback_failed=true
    rollback_step "Checking rollback critical services" check_critical_services || rollback_failed=true
    rollback_step "Checking rollback backend health" check_backend_health || rollback_failed=true
    rollback_step "Checking rollback frontend health" check_frontend_health || rollback_failed=true
  fi

  if [ "$rollback_failed" = "true" ]; then
    error "CRITICAL: rollback did not complete cleanly."
    print_restore_instruction
  else
    error "Rollback completed. Production restored to $PREVIOUS_COMMIT."
    error "Deploy job will still fail because the new deployment failed."
  fi

  exit "$original_exit_code"
}

handle_error() {
  local exit_code=$?
  local line="${1:-unknown}"
  local command="${2:-unknown}"

  error "Command failed at line $line: $command"

  if [ "$DEPLOY_SUCCEEDED" = "true" ]; then
    exit "$exit_code"
  fi

  if [ "$ROLLBACK_IN_PROGRESS" = "true" ]; then
    exit "$exit_code"
  fi

  rollback "$exit_code"
}

deploy_success_cleanup() {
  DEPLOY_SUCCEEDED=true

  log "Deploy succeeded"
  log "Previous commit: $PREVIOUS_COMMIT"
  log "Current commit: $NEW_COMMIT"

  if [ "$PRUNE_AFTER_SUCCESS" = "true" ]; then
    log "Pruning unused Docker images after successful deploy"
    if ! docker image prune -f; then
      warn "Docker image prune failed after successful deploy"
    fi
  else
    warn "Docker image prune skipped because PRUNE_AFTER_SUCCESS=$PRUNE_AFTER_SUCCESS"
  fi

  if [ -d "$BACKUP_DIR" ] && [ "$BACKUP_RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
    find "$BACKUP_DIR" -type f -name 'postgres_*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete
  fi

  compose ps
}

main() {
  cd "$APP_DIR"
  load_env_file
  set_deploy_defaults
  ensure_clean_worktree
  save_current_state
  backup_database

  ROLLBACK_ALLOWED=true

  pull_new_version
  validate_compose
  build_services
  run_migrations
  start_services

  if [ "$FORCE_DEPLOY_FAIL_AFTER_UP" = "true" ]; then
    error "Forced deploy failure requested by FORCE_DEPLOY_FAIL_AFTER_UP=true"
    return 1
  fi

  check_critical_services
  check_backend_health
  check_frontend_health
  check_optional_services
  deploy_success_cleanup
}

trap 'handle_error "$LINENO" "$BASH_COMMAND"' ERR

main "$@"
