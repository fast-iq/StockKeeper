#!/usr/bin/env bash
#
# StockKeeper update + cleanup: repo to latest commit, images to latest
# published versions, system packages, and disk reclamation (old images,
# apt cache, old journal). Idempotent; safe to re-run.
#
#   cd /opt/stockkeeper && sudo bash deploy/server-update.sh
#
# Never builds images (small disks) and never touches database data:
# PostgreSQL runs on the host and is not part of Docker cleanup.
#
set -euo pipefail
trap 'printf "[ERROR] %s (строка %s)\n" "$BASH_COMMAND" "$LINENO" >&2' ERR

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/docker/compose.yaml"
ENV_FILE="/etc/stockkeeper/stockkeeper.env"

log()  { printf '\n=== %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die()  { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
if [ "$(id -u)" -ne 0 ]; then
  exec sudo bash "${BASH_SOURCE[0]}" "$@"
fi

[ -d "$REPO_ROOT/.git" ] || die "Не найден git-репозиторий в $REPO_ROOT — запускайте из клона репозитория."
[ -f "$COMPOSE_FILE" ] || die "Не найден $COMPOSE_FILE."
[ -f "$ENV_FILE" ] || die "Нет $ENV_FILE — сначала выполните deploy/server-setup.sh."
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose не найден — сначала выполните deploy/server-setup.sh."
fi

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

DISK_BEFORE="$(df -h / | awk 'NR==2 {print $4 " свободно (" $5 ")"}')"
GIT_BEFORE="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

# ---------------------------------------------------------------- 1. repo
log "Шаг 1. Обновление репозитория"
if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no 2>/dev/null || true)" ]; then
  warn "Изменены отслеживаемые файлы репозитория — git pull пропущен, обновляется текущий чекаут."
  warn "Уберите изменения (git status) и повторите запуск, чтобы получить последние версии кода."
else
  if git -C "$REPO_ROOT" pull --ff-only -q; then
    info "Коммит: $GIT_BEFORE → $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  else
    warn "git pull не прошёл (сеть?) — продолжаем с текущим чекаутом."
  fi
fi

# ---------------------------------------------------------------- 2. apt
log "Шаг 2. Системные пакеты (apt)"
export DEBIAN_FRONTEND=noninteractive
APT_OK=0
for _i in 1 2 3; do
  if apt-get update -qq; then
    APT_OK=1
    break
  fi
  sleep 5
done
if [ "$APT_OK" -ne 1 ]; then
  warn "apt-get update не прошёл (3 попытки) — обновление пакетов пропущено."
elif apt-get upgrade -y -qq -o DPkg::Lock::Timeout=120; then
  info "Пакеты обновлены."
else
  warn "apt-get upgrade не прошёл — продолжаем без него (повторите позже)."
fi
if [ -f /var/run/reboot-required ]; then
  warn "Требуется перезагрузка сервера (есть /var/run/reboot-required) — сделайте в удобное время."
fi

# ---------------------------------------------------------------- 3. containers
log "Шаг 3. Обновление контейнеров (pull → up)"
compose config --quiet
compose pull
compose up -d

API_CID="$(compose ps -q api)"
[ -n "$API_CID" ] || die "Контейнер api не запустился: $(compose ps)"
info "Ожидание healthcheck API (start-period до 60 с)…"
HEALTH="unknown"
for _ in $(seq 1 90); do
  HEALTH="$(docker inspect -f '{{.State.Health.Status}}' "$API_CID" 2>/dev/null || echo missing)"
  [ "$HEALTH" = "healthy" ] && break
  if [ "$HEALTH" = "exited" ] || [ "$HEALTH" = "missing" ]; then
    compose logs --tail 40 api >&2 || true
    die "Контейнер api завершился (status: $HEALTH)."
  fi
  sleep 1
done
[ "$HEALTH" = "healthy" ] || die "API не стал healthy за 90 с (status: $HEALTH)."
info "API — healthy."

# ---------------------------------------------------------------- 4. verify
log "Шаг 4. Проверка"
API_LOGS="$(compose logs api 2>/dev/null || true)"
case "$API_LOGS" in
  *"Production database migrations are up to date"*)
    info "Миграции БД: OK."
    ;;
  *)
    compose logs --tail 40 api >&2 || true
    die "В логах API нет строки о миграциях."
    ;;
esac

APP_DOMAIN="$(sed -n 's|^APP_DOMAIN=||p' "$ENV_FILE" | head -n 1)"
[ -n "$APP_DOMAIN" ] || die "В $ENV_FILE нет APP_DOMAIN."
CODE="000"
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://$APP_DOMAIN/api/healthz" || echo 000)"
  [ "$CODE" = "200" ] && break
  sleep 2
done
[ "$CODE" = "200" ] || die "https://$APP_DOMAIN/api/healthz → HTTP $CODE (логи: compose logs web)."
info "https://$APP_DOMAIN/api/healthz → 200."

# ---------------------------------------------------------------- 5. cleanup
log "Шаг 5. Очистка (старые образы, apt-кэш, журнал)"
PRUNE_OUT="$(docker image prune -a -f 2>/dev/null | tail -n 1 || true)"
if [ -n "$PRUNE_OUT" ]; then
  info "$PRUNE_OUT"
else
  info "Старых образов нет."
fi
apt-get clean
journalctl --vacuum-time=7d >/dev/null 2>&1 || warn "Не удалось почистить журнал (journalctl)."

# ---------------------------------------------------------------- report
DISK_AFTER="$(df -h / | awk 'NR==2 {print $4 " свободно (" $5 ")"}')"
log "Готово"
info "Диск: $DISK_BEFORE → $DISK_AFTER"
GIT_AFTER="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
if [ "$GIT_BEFORE" != "$GIT_AFTER" ]; then
  info "Обновления кода:"
  git -C "$REPO_ROOT" log --oneline "$GIT_BEFORE..$GIT_AFTER" | sed 's/^/      /'
else
  info "Код уже был актуален ($GIT_AFTER)."
fi
info "Статус: $(compose ps --format '{{.Name}}: {{.Status}}' | tr '\n' ' ')"
info "Повторный запуск скрипта безопасен."
