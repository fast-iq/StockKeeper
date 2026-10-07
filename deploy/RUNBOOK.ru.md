# StockKeeper — полная инструкция развёртывания на чистом сервере

Скрипт `deploy/server-setup.sh` выполняет почти всё автоматически. Ниже —
последовательность с нуля: от чистого Debian до работающего сайта.

## 0. Требования и предусловия (до входа на сервер)

**Сервер:** Debian 12/13, root-доступ, ≥ 8 ГБ свободного диска, открытые
входящие порты `80/tcp` и `443/tcp+udp` у провайдера (собственный firewall
настроит скрипт). Сборка образов на сервере не нужна и не должна
выполняться — только загрузка из GHCR.

**GitHub (одноразово):**

1. Репозиторий публичен → оба пакета образов должны быть **Public**:
   `github.com/fast-iq/StockKeeper/pkgs/container/stockkeeper-api` и
   `.../stockkeeper-web` → Package settings → Change visibility → Public.
2. Actions → Secrets and variables → **Variables** → создать
   `VITE_GOOGLE_CLIENT_ID` = ваш Google OAuth Client ID (публичный,
   например `…apps.googleusercontent.com`).
3. Сделать push в `main` и дождаться зелёного workflow
   **«Publish Docker images»** — без него `pull` не найдёт образы.

**Google Cloud Console (для входа по Google, можно позже):**
APIs & Services → Credentials → OAuth 2.0 Client ID → запомнить Client ID.
JavaScript origin добавим после того, как узнаем итоговый домен (шаг 3).

## 1. Первые команды на сервере

```sh
apt-get update && apt-get install -y git
git clone https://github.com/fast-iq/StockKeeper.git /opt/stockkeeper
cd /opt/stockkeeper
```

## 2. Запуск установщика

```sh
bash deploy/server-setup.sh
```

(под root; если вошли другим пользователем — `sudo bash deploy/server-setup.sh`).

### Что спросит скрипт

| Промпт                         | Что вводить                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Пароль для БД                  | Enter — сгенерировать надёжный (запишется в env-файл); свой — без символов `@ : / ? #`                                       |
| Публичный домен (APP_DOMAIN)   | Enter — вариант `<IP>.sslip.io` (TLS выпускается сам, DNS не нужен); свой домен — вписать целиком, например `inv.example.ru` |
| Порты VPN через запятую        | Enter — пропустить; позже можно добавить: `ufw allow <порт>`                                                                 |
| Google Client ID               | Enter — заглушка `not-configured` (вход по паролю работает, Google — нет); или вставить Client ID из Google Cloud Console    |
| Перезаписать существующий env? | Только при повторном запуске и желании сменить значения; по умолчанию **Нет** — файл сохраняется как есть                    |

### Что делает скрипт (шаги)

- **0** — чеклист предусловий GitHub.
- **1** — пакеты: `postgresql`, `ufw`, `git`, `curl`, `openssl`.
- **2** — PostgreSQL: роль и БД `stockkeeper`, `pg_hba.conf` для
  `172.16.0.0/12` (scram-sha-256), `listen_addresses`, проверка TCP.
- **3** — ufw: `22/tcp`, `80/tcp`, `443` (tcp+udp — нужен HTTP/3),
  `5432/tcp` только для docker-сети (интернету БД закрыта), порты VPN,
  затем включение. Правила добавляются **до** `ufw enable`.
- **4** — `/etc/stockkeeper/stockkeeper.env` (права 600):
  `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `EXTERNAL_DB_URL`.
- **5** — `compose config` + анонимная проверка доступности образов GHCR.
- **6** — `pull` + `up -d` + ожидание healthcheck (start-period до 60 с).
- **7** — в логах API ищется строка миграций, затем внешние проверки
  `healthz` и главной страницы (ожидается 200/200).

Скрипт **идемпотентен**: повторный запуск безопасен — существующий env-файл
не перезапрашивается (пароль БД берётся из него), правила firewall не
дублируются, контейнеры пересоздаются только если образ новый.

## 3. Ручные шаги после скрипта (2 пункта)

1. **Google-вход:** Google Cloud Console → APIs & Services → Credentials →
   OAuth Client → **Authorized JavaScript origins** → добавить
   `https://<APP_DOMAIN>` (именно с `https://`, без слэша). До этого вход по
   Google не работает; вход паролем работает сразу.
2. **Проверка закрытия БД снаружи:** `Test-NetConnection <IP> -Port 5432`
   → `TcpTestSucceeded: False` (на Linux: `nc -zv <IP> 5432` — не должен
   соединяться).

## 4. Проверка работоспособности

```sh
# внешний вид
curl -sI https://<APP_DOMAIN>/api/healthz     # HTTP/1.1 200
```

- Открыть `https://<APP_DOMAIN>` в браузере и **зарегистрироваться** —
  первый аккаунт становится пользователем системы.
- Логи миграций:

```sh
docker compose --env-file /etc/stockkeeper/stockkeeper.env \
  -f /opt/stockkeeper/deploy/docker/compose.yaml logs api | grep -i migrat
# ожидается: "Production database migrations are up to date"
```

- Схема в БД: `sudo -u postgres psql -d stockkeeper -tAc \
"select count(*) from information_schema.tables where table_schema='public'"`
  → `13` (12 таблиц приложения + журнал миграций).

## 5. Ежедневная эксплуатация

**Обновление до последних версий + очистка хвостов** — один скрипт:

```sh
cd /opt/stockkeeper && bash deploy/server-update.sh
```

Он делает: `git pull` (только при чистом рабочем дереве) → `apt update/upgrade`
→ `compose pull` + `up -d` → ожидание healthcheck → проверка миграций и
`healthz` → очистка (старые образы `docker image prune`, apt-кэш, журнал
старше 7 дней). Идемпотентен, повторный запуск безопасен; после него в отчёте
видно, сколько места освобождено и какие коммиты применены.

Вручную (эквивалент, если скрипт недоступен):

```sh
cd /opt/stockkeeper && git pull
docker compose --env-file /etc/stockkeeper/stockkeeper.env \
  -f deploy/docker/compose.yaml pull
docker compose --env-file /etc/stockkeeper/stockkeeper.env \
  -f deploy/docker/compose.yaml up -d
```

Статус и логи — те же пути с `ps` и `logs -f api`.

**Резервные копии (настроено 06.10.2026):**

- Скрипт `/usr/local/sbin/stockkeeper-backup.sh`: `pg_dump -Fc` в
  `/var/backups/stockkeeper/stockkeeper-<метка времени>.dump` (владелец
  `postgres:postgres`, режим 600, каталог 750 root:postgres), проверка
  читаемости через `pg_restore -l`, ротация — 14 дней, защита от
  параллельного запуска через `flock`.
- Cron в `/etc/crontab`: ежедневно в `04:30`, журнал —
  `/var/log/stockkeeper-backup.log`.
- Проверка вручную: `bash /usr/local/sbin/stockkeeper-backup.sh`.
- Восстановление: `sudo -u postgres pg_restore -d stockkeeper <дамп>`.

Копии хранятся только **на сервере** — раз в несколько дней/недель выгружать
дампы вовне (S3/другой хост): сервер — не единственное место хранения.

**Письма (сброс пароля)** без SMTP отвечают `503` — это ожидаемо. Когда
понадобится почта: заполнить `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/
SMTP_FROM` в env-файле и выполнить `up -d`.

## 6. Типовые проблемы

| Симптом                               | Причина и решение                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pull`: `unauthorized` / 401          | Пакет GHCR приватен → Package settings → Change visibility → Public                                                         |
| CI «Publish Docker images» падает     | Нет Actions-переменной `VITE_GOOGLE_CLIENT_ID`                                                                              |
| `ENOSPC` / не хватает места           | На диске ≤ 8 ГБ не собирать образы — только pull (скрипт собирает никогда)                                                  |
| Caddy: «hostname does not resolve»    | `APP_DOMAIN` должен резолвиться; `<IP>.sslip.io` — резолвится сам; голый IP в `APP_DOMAIN` нельзя (нет TLS и Google-origin) |
| Контейнер API `unhealthy` дольше 60 с | `… logs api` — смотреть ошибку подключения к БД/миграций                                                                    |
| `forgot-password` → 503               | SMTP не настроен — ожидаемо; заполнить `SMTP_*` в env и `up -d`                                                             |
| CI: Security Audit красный            | Новый advisory → разобрать в AGENTS §3.1; известная `braces` устранена 07.10.2026 (fast-glob → tinyglobby)                  |
| Сменился IP сервера                   | sslip-домен изменится → обновить `APP_DOMAIN` в env → `up -d --force-recreate` → новый origin в Google Cloud Console        |
| Google-вход не работает               | Origin в Google Console должен точно совпадать: `https://<APP_DOMAIN>` (проверить раскладку/слэш)                           |
| Хочу свой домен                       | Направить A-запись на сервер → `APP_DOMAIN` в env → `up -d --force-recreate` → новый origin в Google                        |

## 7. Безопасность

- После любых тестов по временным паролям/ключам — сменить пароль root,
  удалить временные SSH-ключи из `~/.ssh/authorized_keys`, желательно
  отключить вход по паролю (только ключи).
- `ufw status verbose` должен показывать только `22/tcp`, `80/tcp`, `443`
  (+VPN при необходимости); `5432` — только для `172.16.0.0/12`.
- Секреты живут только в `/etc/stockkeeper/stockkeeper.env` (600) — не
  копировать их в репозиторий, GitHub и переписку.
