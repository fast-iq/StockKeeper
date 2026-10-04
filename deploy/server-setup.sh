#!/usr/bin/env bash
#
# StockKeeper server setup: PostgreSQL + firewall + host env file + containers.
#
# Run from a repository checkout on a fresh Debian/Ubuntu VPS (systemd):
#
#   git clone https://github.com/fast-iq/StockKeeper.git
#   cd StockKeeper && sudo bash deploy/server-setup.sh
#
# The script is idempotent: re-running keeps the existing host env file
# (default answer "n") and never drops firewall rules or databases.
# All prompts are in Russian; every secret explains where to get it.
#
set -euo pipefail
trap 'printf "[ERROR] %s (строка %s)\n" "$BASH_COMMAND" "$LINENO" >&2' ERR

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/deploy/docker/compose.yaml"
ENV_DIR="/etc/stockkeeper"
ENV_FILE="$ENV_DIR/stockkeeper.env"
DB_NAME="stockkeeper"
DB_USER="stockkeeper"

log()  { printf '\n=== %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die()  { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

ask() {
  # ask VAR "текст вопроса" "значение по умолчанию"
  local __var="$1" __prompt="$2" __default="${3-}" __reply=""
  if [ -n "$__default" ]; then
    printf '%s [%s]: ' "$__prompt" "$__default"
  else
    printf '%s: ' "$__prompt"
  fi
  IFS= read -r __reply || true
  [ -z "$__reply" ] && __reply="$__default"
  printf -v "$__var" '%s' "$__reply"
}

as_postgres() {
  if [ "$(id -un)" = "postgres" ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u postgres "$@"
  else
    su -s /bin/sh postgres -c "$(printf '%q ' "$@")"
  fi
}

is_ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }

ensure_postgres_running() {
  if as_postgres psql -tAc 'SELECT 1' >/dev/null 2>&1; then
    return 0
  fi
  if [ "$HAS_SYSTEMD" -eq 1 ]; then
    systemctl start postgresql
  else
    service postgresql start 2>/dev/null ||
      as_postgres pg_ctlcluster "$PG_VERSION" start
  fi
  local _i
  for _i in 1 2 3 4 5 6 7 8 9 10; do
    if as_postgres psql -tAc 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "PostgreSQL не запускается — проверьте journalctl -u postgresql."
}

# ---------------------------------------------------------------- 0. preflight
if [ "$(id -u)" -ne 0 ]; then
  exec sudo bash "${BASH_SOURCE[0]}" "$@"
fi

[ -r /etc/os-release ] || die "Не найден /etc/os-release — поддерживаются Debian/Ubuntu."
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  debian | ubuntu) ;;
  *) die "Поддерживаются только Debian/Ubuntu (обнаружено: ${ID:-unknown})." ;;
esac

[ -f "$COMPOSE_FILE" ] || die "Не найден $COMPOSE_FILE — запускайте скрипт из клона репозитория."

HAS_SYSTEMD=0
[ -d /run/systemd/system ] && HAS_SYSTEMD=1
if [ "$HAS_SYSTEMD" -eq 0 ]; then
  warn "systemd не обнаружен (контейнер?) — секции firewall и Docker будут пропущены."
fi

log "Шаг 0. Предусловия на GitHub (проверка)"
info "Нужно ДО запуска (сделайте, если ещё не сделано):"
info "  1) Actions-переменная VITE_GOOGLE_CLIENT_ID = ваш Google OAuth Client ID"
info "     (github.com → репозиторий → Settings → Secrets and variables → Actions → Variables)."
info "  2) Оба пакета образов GHCR — Public:"
info "     github.com/<owner>/<repo>/pkgs/container/*  → Package settings → Change visibility → Public."
info "  3) Push в main и зелёный workflow «Publish Docker images»."
info "  4) Для Google-входа: позже добавить origin https://<APP_DOMAIN> в Google Cloud Console"
info "     → APIs & Services → Credentials → OAuth Client → Authorized JavaScript origins."

# ---------------------------------------------------------------- 1. packages
log "Шаг 1. Пакеты (apt)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql ufw git curl openssl ca-certificates

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if [ "$HAS_SYSTEMD" -eq 1 ]; then
    ask DOCKER_INSTALL "Docker с compose-плагином не установлен. Установить (официальный скрипт get.docker.com)?" "y"
    case "$DOCKER_INSTALL" in
      y | Y | д | Д)
        curl -fsSL https://get.docker.com | sh
        docker compose version >/dev/null 2>&1 || die "Docker Compose не заработал после установки."
        ;;
      *) die "Без Docker запуск контейнеров невозможен." ;;
    esac
  else
    warn "Docker отсутствует — секция контейнеров будет пропущена."
  fi
fi

# ---------------------------------------------------------------- 2. postgres
log "Шаг 2. PostgreSQL"

PG_CONF_DIR="$(ls -d /etc/postgresql/*/main 2>/dev/null | sort -V | tail -n 1 || true)"
[ -n "$PG_CONF_DIR" ] || die "Не найден каталог конфигурации PostgreSQL (пакет postgresql установлен?)"
PG_VERSION="$(basename "$(dirname "$PG_CONF_DIR")")"
ensure_postgres_running

STORED_PASSWORD=""
if [ -f "$ENV_FILE" ]; then
  STORED_PASSWORD="$(sed -n 's|^EXTERNAL_DB_URL=postgresql://[^:]*:\([^@]*\)@.*|\1|p' "$ENV_FILE" | head -n 1)"
fi

if [ -n "$STORED_PASSWORD" ]; then
  DB_PASSWORD="$STORED_PASSWORD"
  info "Пароль БД взят из существующего $ENV_FILE (файл не перезапрашивается)."
else
  DEFAULT_PASSWORD="$(openssl rand -hex 16)"
  info "Пароль пользователя БД. По умолчанию будет сгенерирован надёжный пароль;"
  info "он попадёт в $ENV_FILE (корень, права 600) — сохраните его отдельно."
  ask DB_PASSWORD "Пароль для БД (Enter = сгенерировать)" "$DEFAULT_PASSWORD"
fi
[[ "$DB_PASSWORD" =~ [@:/\?#] ]] && die "Пароль содержит символы '@ : / ? #' — они ломают URL подключения. Укажите другой."

if as_postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1; then
  SQL_PW="${DB_PASSWORD//\'/\'\'}"
  as_postgres psql -qc "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$SQL_PW'"
  info "Роль $DB_USER уже существует — пароль синхронизирован с env-файлом."
else
  SQL_PW="${DB_PASSWORD//\'/\'\'}"
  as_postgres psql -qc "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$SQL_PW'"
  info "Создана роль $DB_USER."
fi

if as_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  info "База $DB_NAME уже существует."
else
  as_postgres createdb -O "$DB_USER" "$DB_NAME"
  info "Создана база $DB_NAME (владелец — $DB_USER)."
fi

HBA_LINE="host all all 172.16.0.0/12 scram-sha-256"
if grep -qF "$HBA_LINE" "$PG_CONF_DIR/pg_hba.conf"; then
  info "Строка docker-сети в pg_hba.conf уже есть."
else
  printf '%s\n' "$HBA_LINE" >>"$PG_CONF_DIR/pg_hba.conf"
  info "В pg_hba.conf добавлено: $HBA_LINE"
fi

as_postgres psql -qc "ALTER SYSTEM SET listen_addresses = '*'"

if [ "$HAS_SYSTEMD" -eq 1 ]; then
  systemctl restart postgresql   # listen_addresses применяется только при перезапуске, не reload
else
  service postgresql restart 2>/dev/null || service postgresql start ||
    as_postgres pg_ctlcluster "$PG_VERSION" start
fi

LISTEN="$(as_postgres psql -tAc 'SHOW listen_addresses')"
[ "$LISTEN" = "*" ] || die "listen_addresses = '$LISTEN' вместо '*'."

TCP_OK=0
for _ in 1 2 3 4 5; do
  if PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT current_user" 2>/dev/null | grep -q "^$DB_USER$"; then
    TCP_OK=1
    break
  fi
  sleep 1
done
[ "$TCP_OK" -eq 1 ] || die "Подключение TCP к 127.0.0.1 не прошло — проверьте pg_hba.conf и пароль."
info "Проверка TCP-подключения (127.0.0.1) — OK."

# ---------------------------------------------------------------- 3. firewall
if [ "$HAS_SYSTEMD" -eq 1 ]; then
  log "Шаг 3. Firewall (ufw)"
  info "Правила добавляются ДО включения ufw. БД (5432) откроется только для docker-сети,"
  info "интернету она недоступна. Если у вас VPN — укажите его порты (через запятую)."

  SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"
  [ -n "$SSH_PORT" ] || SSH_PORT=22
  ask SSH_PORT "Порт SSH" "$SSH_PORT"
  [[ "$SSH_PORT" =~ ^[0-9]+$ ]] || die "Некорректный порт SSH: $SSH_PORT"

  ask VPN_PORTS "Порты VPN через запятую (Enter — пропустить)" ""
  if [ -n "$VPN_PORTS" ]; then
    [[ "$VPN_PORTS" =~ ^[0-9]+(,[0-9]+)*$ ]] || die "Некорректный список портов: $VPN_PORTS"
  fi

  ufw allow "${SSH_PORT}/tcp"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp   # HTTP/3
  ufw allow from 172.16.0.0/12 to any port 5432 proto tcp
  if [ -n "$VPN_PORTS" ]; then
    IFS=',' read -ra VPN_LIST <<<"$VPN_PORTS"
    for port in "${VPN_LIST[@]}"; do
      ufw allow "$port"
    done
  fi
  ufw --force enable
  info "Активные правила:"
  ufw status verbose | sed 's/^/      /'
else
  log "Шаг 3. Firewall — пропущен (нет systemd)"
fi

# ---------------------------------------------------------------- 4. env file
log "Шаг 4. Host env-файл ($ENV_FILE)"

OVERWRITE="n"
if [ -f "$ENV_FILE" ]; then
  info "Файл уже существует. Значения по умолчанию — из него (пароль БД не переспрашивается)."
  ask OVERWRITE "Перезаписать env-файл заново?" "n"
fi

if [ -f "$ENV_FILE" ] && [[ ! "$OVERWRITE" =~ ^([yYдД])$ ]]; then
  info "Существующий env-файл сохранён без изменений."
else
  PUBLIC_IP="$(curl -4 -s --max-time 5 https://ifconfig.me 2>/dev/null || true)"
  [ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(curl -4 -s --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [ -n "$PUBLIC_IP" ] || PUBLIC_IP="ВАШ-IP"
  DEFAULT_DOMAIN="${PUBLIC_IP//./-}.sslip.io"

  while true; do
    ask APP_DOMAIN "Публичный домен приложения (Caddy выпустит под него TLS; пусто = sslip.io-вариант)" "$DEFAULT_DOMAIN"
    if is_ipv4 "$APP_DOMAIN"; then
      info "Это IP-адрес: Let's Encrypt не выдаёт сертификаты на IP, Google OAuth запрещает IP."
      info "Укажите домен (можно ${DEFAULT_DOMAIN} — работает без настройки DNS)."
      continue
    fi
    [[ "$APP_DOMAIN" =~ ^[A-Za-z0-9._-]+$ ]] || die "Некорректный домен: $APP_DOMAIN"
    break
  done

  DEFAULT_CLIENT_ID=""
  if [ -f "$ENV_FILE" ] && [[ "$OVERWRITE" =~ ^([yYдД])$ ]]; then
    DEFAULT_CLIENT_ID="$(sed -n 's|^GOOGLE_CLIENT_ID=||p' "$ENV_FILE" | head -n 1)"
  fi
  info "Google OAuth Client ID: Google Cloud Console → APIs & Services → Credentials →"
  info "OAuth 2.0 Client IDs → Client ID (формат …apps.googleusercontent.com)."
  info "Можно пропустить — впишется заглушка, вход по паролю будет работать, Google — нет."
  ask GOOGLE_CLIENT_ID "Google Client ID (Enter — пропустить)" "$DEFAULT_CLIENT_ID"
  if [ -z "$GOOGLE_CLIENT_ID" ]; then
    GOOGLE_CLIENT_ID="not-configured"
    info "В env-файл записана заглушка not-configured."
  fi

  SESSION_SECRET="$(openssl rand -hex 32)"
  info "SESSION_SECRET сгенерирован автоматически (openssl rand -hex 32)."

  install -d -m 700 "$ENV_DIR"
  TMP_ENV="$(mktemp)"
  {
    printf 'APP_DOMAIN=%s\n' "$APP_DOMAIN"
    printf 'GOOGLE_CLIENT_ID=%s\n' "$GOOGLE_CLIENT_ID"
    printf 'SESSION_SECRET=%s\n' "$SESSION_SECRET"
    printf 'EXTERNAL_DB_URL=postgresql://%s:%s@host.docker.internal:5432/%s\n' \
      "$DB_USER" "$DB_PASSWORD" "$DB_NAME"
  } >"$TMP_ENV"
  install -m 600 "$TMP_ENV" "$ENV_FILE"
  rm -f "$TMP_ENV"
  info "Записан $ENV_FILE (600):"
  grep -E '^[A-Z_]+=' "$ENV_FILE" | sed 's/=.*/=***ок***/' | sed 's/^/      /'
  info "      APP_DOMAIN=$APP_DOMAIN"
fi

APP_DOMAIN="$(sed -n 's|^APP_DOMAIN=||p' "$ENV_FILE" | head -n 1)"

# ---------------------------------------------------------------- 5. compose
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "Шаг 5-7. Контейнеры — пропущены (Docker не установлен)"
  warn "Установите Docker и повторите запуск скрипта — шаги 5-7 выполнят конфигурацию, pull и старт."
  exit 0
fi

log "Шаг 5. Проверка конфигурации и доступности образов"
compose config --quiet
info "compose config — OK."

IMAGES="$(grep -oE 'ghcr\.io/[^[:space:]:]+/[^[:space:]:]+-(api|web)' "$COMPOSE_FILE" | sort -u || true)"
[ -n "$IMAGES" ] || die "Не удалось определить имена образов в $COMPOSE_FILE."
for image in $IMAGES; do
  TOKEN="$(curl -fsS "https://ghcr.io/token?scope=repository:${image#ghcr.io/}:pull&service=ghcr.io" 2>/dev/null | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' || true)"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' \
    "https://ghcr.io/v2/${image#ghcr.io/}/manifests/latest" || true)"
  case "$CODE" in
    200) info "$image — доступен." ;;
    404) die "$image не опубликован: задайте Actions-переменную VITE_GOOGLE_CLIENT_ID и дождитесь зелёного workflow «Publish Docker images»." ;;
    401) die "$image приватный: откройте страницу пакета на GitHub → Package settings → Change visibility → Public." ;;
    *)   die "$image: неожиданный ответ реестра (HTTP $CODE)." ;;
  esac
done

log "Шаг 6. Запуск контейнеров"
info "На маленьких дисках используйте только pull (сборка на хосте требует ~15 ГБ)."
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

# ---------------------------------------------------------------- 7. verify
log "Шаг 7. Проверка"

if compose logs api 2>/dev/null | grep -q 'Production database migrations are up to date'; then
  info "Миграции БД: «Production database migrations are up to date» (на пустой БД схема создана сама)."
else
  compose logs --tail 40 api >&2 || true
  die "В логах API нет строки о миграциях — образ старый или БД недоступна."
fi

CODE="000"
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://$APP_DOMAIN/api/healthz" || echo 000)"
  [ "$CODE" = "200" ] && break
  sleep 2
done
[ "$CODE" = "200" ] || die "https://$APP_DOMAIN/api/healthz → HTTP $CODE. Проверьте DNS (A-запись на этот сервер), порты 80/443 и логи: docker compose logs web."
info "https://$APP_DOMAIN/api/healthz → 200."

ROOT_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://$APP_DOMAIN/" || echo 000)"
info "https://$APP_DOMAIN/ → $ROOT_CODE."

log "Готово"
info "Сайт:   https://$APP_DOMAIN  (откройте в браузере и зарегистрируйтесь)"
info "Логи:   docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f api"
info "Статус: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE ps"
info "Обновление после нового коммита: git pull && docker compose --env-file $ENV_FILE -f $COMPOSE_FILE pull && docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d"
info ""
info "Осталось вручную (для Google-входа):"
info "  • Google Cloud Console → Credentials → OAuth Client → Authorized JavaScript origins →"
info "    добавить https://$APP_DOMAIN"
info "  • Снаружи проверить закрытие БД: Test-NetConnection <IP> -Port 5432 → False."
