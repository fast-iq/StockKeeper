# AGENTS.md — памятка ассистента (изменения, инварианты, проверки)

> **Правило работы:** проект ведётся несколькими разработчиками — в git'е всегда последняя версия,
> локальная может отставать.
>
> 1. **Перед началом любой задачи** — `git pull` (рабочее дерево должно быть чистым: не начинать
>    с незакоммиченных изменений), затем чтение разделов «Инварианты» и «Изменения».
> 2. **Перед внесением правок** — перечитать AGENTS.md ещё раз: после pull коллеги могли добавить
>    пункты/инварианты, и опираться надо на свежую версию памятки, а не на прочитанную в начале сессии.
> 3. После правок — прогонять «Команды проверки». Ничего из перечисленного ниже не ломать.
> 4. Перед каждой задачей проверять актуальную ветку GitHub: пользователь дорабатывает приложение
>    там. Если `git pull` недоступен, синхронизировать проверенный снимок через интеграцию или архив;
>    не продолжать на устаревших исходниках и не затирать локальные правки/пользовательские загрузки.
> 5. При собственных изменениях проекта обновлять AGENTS.md в той же сессии: изменения,
>    инварианты и результаты проверок.

---

## 1. Как проверять (обязательный прогон после любых правок)

Окружение Windows, pnpm/node не в PATH. Использовать:

```powershell
$nodeDir = "C:\Users\Sidelnikov\AppData\Local\Temp\node24-extract\node-v24.11.1-win-x64"
$env:PATH = "$nodeDir;C:\Users\Sidelnikov\AppData\Local\Temp\opencode\bin;C:\Program Files\Git\usr\bin;$env:PATH"
Set-Location "D:\Project\TypeScript\StockKeeper"
pnpm run format:check      # репо должно быть полностью отформатировано (CI gate)
pnpm run lint              # 0 ошибок И 0 warnings (гейт --max-warnings=0, см. §2.13)
pnpm run typecheck         # 0 ошибок
pnpm run test              # Google auth + регрессии обмена данными + session cookie
pnpm run build             # typecheck + сборка всех workspace-пакетов
pnpm audit --audit-level=high   # No known vulnerabilities found
```

Полезные команды: `pnpm format` — прогон prettier по всему репо (после полного
реформата — идемпотентен, не должен менять чужие файлы; если меняет — разбираться,
не коммитить вслепую).

- `pnpm` = обёртка `C:\Users\Sidelnikov\AppData\Local\Temp\opencode\bin\pnpm.cmd` → `corepack pnpm@10.34.6`
  (закреплён 10.x, чтобы не поднять `lockfileVersion '9.0'` → '10.0'; в `package.json` добавлен
  `"packageManager": "pnpm@10.34.6"` — по нему же работает `pnpm/action-setup` в CI).
- E2E/smoke-скрипты живут во `%TEMP%\opencode\` (не в репо) и при необходимости пересоздаются: см. раздел 6.

В Replit/Linux Node.js и pnpm доступны в PATH. Команды проверки те же, без Windows-настройки
PATH и `Set-Location`, но запускать как `corepack pnpm …` для версии из `packageManager`.
После синхронизации зависимостей сохранять версии из lockfile.

## 2. Инварианты (что нельзя ломать)

1. **CORS**: опция `origin` должна быть **callback-стиля**:
   `origin: (origin, callback) => callback(null, isAllowedOrigin(origin))`.
   Sync-функция `(origin) => boolean` **навешивает ВСЕ запросы** (cors не вызывает `next`) — уже было поймано на smoke-тесте. (`app.ts`)
2. **Любые UPDATE/DELETE — только с `WHERE … AND userId = <текущий пользователь>`** (или `or(isNull(userId), eq(userId, …))` для глобальных units). Проверка владельца ПОСЛЕ апдейта = IDOR.
3. **Ссылки в телах запросов валидируются на владельца до записи**: `categoryId`, `unitId` (свой ИЛИ глобальный), `locationId`, `parentId` категорий, `itemId` shopping-list.
4. **Обходы иерархий — только с `visited`/`seen` Set** (`getAllDescendantIds`, подъём по `parentId`), иначе петля в данных → вечный цикл. Запрет: self-parent, чужой parent, цикл (ошибка 400).
5. **При логине/регистрации — `session.regenerate()` до записи `userId`** (фиксация сессии).
6. **Один действующий reset-токен**: перед выдачей нового — `usedAt` старым. Гонка register → ловить pg-код `23505` → 409.
7. **session-таблица описана в drizzle-схеме** (`lib/db/src/schema/session.ts`, колонки под connect-pg-simple:
   `sid varchar(255) PK`, `sess json`, `expire timestamp(6)`, индекс `session_expire_idx`) и создаётся
   отслеживаемыми SQL-миграциями. `createTableIfMissing: false` в PgStore — НЕ включать.
   Для новых изменений схемы сначала генерировать миграцию; post-merge применяет миграции к Development.
8. **`SESSION_SECRET` обязателен** (сервер падает без него). `DATABASE_URL` управляется Replit:
   не перезаписывать его для внешней БД. Runtime pool использует `EXTERNAL_DB_URL ?? DATABASE_URL`;
   Drizzle Kit и Development migration runner используют только `DATABASE_URL`.
   Production migration runner требует `EXTERNAL_DB_URL` и завершает запуск с ошибкой, если он
   отсутствует — Production-миграции никогда не переключаются на `DATABASE_URL`.
   Не создавать `.env`/секции `database` в репо.
9. **`X-Frame-Options` не ставить** (может сломать iframe-превью Replit). Добавлен только `X-Content-Type-Options: nosniff`.
10. **`minimumReleaseAge: 1440`** в `pnpm-workspace.yaml` — пакеты младше 24 ч не встанут; не удалять и не «чинить» добавлением в `minimumReleaseAgeExclude` без явного решения пользователя.
11. Cookie: `secure: isProduction`, `sameSite: "lax"` во всех окружениях, `httpOnly: true`,
    `trust proxy = 1`. Frontend и API одного origin: `SameSite=None` не нужен и допускает CSRF
    через cross-site POST-формы. Не возвращать `"none"` без отдельной CSRF-защиты.
12. **CI (`.github/workflows/*`)**: у всех job'ов guard `if: github.repository_owner == 'fast-iq'`;
    у CodeQL и Dependency Review дополнительно `github.event.repository.private == false` — это защита от
    падения без лицензии GitHub Advanced Security на приватном репо. Не убирать без понимания последствий;
    если репо станет публичным или подключат GHAS — guard можно убрать (job'ы включатся сами).
13. **ESLint**: скрипт `lint` = `eslint . --max-warnings=0` — CI падает и на warnings. Держать фонд
    чистым (0/0): `no-explicit-any`, `security/*` — всё исправлено в коде, не подавлять.
    Точечные исключения (единственные в репо): `security/detect-non-literal-fs-filename` выключен в
    `eslint.config.mjs` только для build-тулчейна (`**/*.mjs`, `mockupPreviewPlugin.ts`, `scripts/**`);
    `detect-possible-timing-attacks` — один `eslint-disable-next-line` на клиентскую проверку
    `password !== confirm` в `reset-password.tsx`. Глобально `security/*` НЕ отключать.
14. **Platform-overrides в `pnpm-workspace.yaml`**: записи вида `"pkg>pkg-platform": "-"` исключают нативные
    бинарники других платформ. Для `win32-x64` исключения rollup/esbuild/lightningcss/tailwind-oxide
    **удалены** (иначе `pnpm build` невозможен на Windows). Остальные исключения (в т.ч. `linux-x64-gnu`
    остаётся НЕ исключённым — он нужен CI/Replit) не трогать и не переиспользовать для «оптимизации».
15. **vite-конфиги** (`inventory-app`, `mockup-sandbox`): `PORT` (default `"3000"`) и `BASE_PATH` (default `"/"`)
    больше НЕ бросают throw при отсутствии env — сборка работает везде. Не возвращать безусловные throw.
16. **Заголовки ответов API** (`app.ts`): `app.disable("x-powered-by")`; глобальный middleware ставит
    `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
    не-/api-404 — свой `text/plain`-хендлер с CSP `default-src 'none'; frame-ancestors 'none'; form-action 'none'`
    (вместо HTML finalhandler express). Не убирать — это закрывает ZAP-алерты 10037/10063/10049/10055.
17. **Отчёты ZAP не коммитить**: `results.sarif`, `report_html.html`, `report_json.json`, `report_md.md`
    в `.gitignore` и `.prettierignore` (prettier не парсит отчётный html → `format:check` падает exit 2).
    `results.sarif` при этом пустой (`results: []`) — источник истины для алертов = `report_md.md`/`report_json.json`.
18. **Версия pnpm в Replit**: команды сервисов и postBuild запускаются через `corepack pnpm`,
    чтобы использовать закреплённую версию, не системный launcher. В `.npmrc`
    `manage-package-manager-versions=false` отключает только внутренний менеджер версий pnpm:
    системный launcher в Replit рекурсивно запускал `pnpm add pnpm@…` и падал до старта серверов.
    Corepack и `pnpm/action-setup` по-прежнему используют `packageManager` из `package.json`.
19. **Интеграционные тесты обмена данными**: только отдельный loopback PostgreSQL,
    `NODE_ENV=test`, БД `stockkeeper_transfer_test`, роль `transfer_test`, URL в
    `TRANSFER_TEST_DATABASE_URL`. Никогда не подставлять runtime/Production URL.
    DDL и очистка разрешены только в случайной схеме текущего тестового прогона;
    `public`, пользовательские данные, startup/build и настройки публикации не менять.
20. **Браузерная регрессия подтверждения импорта**: `corepack pnpm test:browser`
    использует тот же guard `TRANSFER_TEST_DATABASE_URL` и новую случайную схему.
    Не подставлять адрес рабочего приложения/Production, не использовать реальные
    аккаунты или `attached_assets/`. Chromium, Vite и API запускаются внутри теста;
    test-only proxy не переносить в рабочую конфигурацию Vite. Google sign-in
    не дублировать. Сценарии и БД не включать в startup/build.
21. **Язык интерфейса**: сохранять именно выбор `ru`/`en`/`auto`, а не результат
    определения языка браузера. Серверный профиль имеет приоритет после входа;
    `auto` снимает прежний явный выбор и снова использует locale браузера.
    Сохранение через настройки должно обновлять кэш профиля и показывать успех
    только после успешного PATCH или подтверждающего GET при потере ответа,
    иначе reload может вернуть прежний язык. Потерянный ответ не доказывает,
    что запись не состоялась: не повторять PATCH автоматически. Если GET тоже
    недоступен, сообщать о неопределённом результате и предлагать сверку.
    PATCH и каждая GET-сверка ограничены 10 секундами через AbortController;
    таймер действует до завершения чтения JSON и снимается в finally.
    Таймаут PATCH — неопределённый результат, не подтверждённый отказ записи.

22. **Полная схема на пустой БД создаётся миграцией `lib/db/migrations/0000_shop_price_history.sql`**
    (полный baseline: 11 таблиц с inline-FK,3 индекса, все `CREATE … IF NOT EXISTS`, затем
    адоптационная дельта). Уже применённую запись журнала не переписывать: раннер `drizzle-orm`
    (pg dialect) решает, применять ли миграцию, сравнивая `created_at` последней строки с
    journal-`when` (`folderMillis`); hash SQL **не** сверяется, но `when` менять нельзя — иначе
    существующие БД (Development/Production) переприменут файл. FK — только inline в
    `CREATE TABLE` (отдельные `ALTER TABLE ADD CONSTRAINT` падают на легаси-таблицах и квалификатор
    `public.` ломает тесты со случайной схемой). Любое расширение файла — только вместе с
    прогоном сценария пустой БД в `artifacts/api-server/tests/migrations.integration.test.mjs`.
    После `0001_data_sources` пустая БД заканчивает с **12 таблицами / 16 FK / 4 индексами /
    journal = 2** — соответствующие ожидания в этом же тесте.

23. **Прокси поиска по источникам (`services/source-search.ts`) — только через SSRF-гард**:
    разрешены лишь http/https без креденшелов; локальные имена (`localhost`/`.local`/`.internal`),
    IP-literal'ы и **все** DNS-ответы резолвера на приватные/loopback/link-local/CGNAT/multicast
    блокируются; каждый редирект (≤3 hops) проверяется заново, таймаут 8 с, лимит тела 2 МиБ,
    rate-limit 30/мин на аккаунт. Шаблоны — только с `{sku}`/`{barcode}`
    (`validateTemplateSyntax` до записи в БД). TOCTOU между DNS-проверкой и connect принят
    и документирован — guard не упрощать и не отключать ради «работы» внутренних адресов.
    **Тот же guard обязателен для `fetchImage`/`GET /data-sources/photo`** (фото-прокси): он
    переиспользует `assertPublicHttpUrl` на каждом хопе, лимит 2 МиБ, `Referer` = origin
    картинки (хотлинк-защита каталогов), rate-limit 300/мин.
24. **Service worker (`artifacts/inventory-app/public/sw.js`) не кэширует `/api/*`** — все
    персональные данные идут только по сети; `fetch`-handler возвращает `undefined` для не-GET,
    чужих origin и путей `/api/`. Стратегия остального: навигация и не-`/assets/*` — network-first
    (свежий `index.html`, фикс «залипшей» версии после деплоя), `/assets/*` — cache-first
    (хешированные файлы). Регистрация SW — только в PROD (`import.meta.env.PROD` в `main.tsx`).
    Кэш переживает обновление: версия в имени (`stockkeeper-<VERSION>`), старые версии удаляются
    на `activate`; при изменении `sw.js` поднимать `VERSION`.

## 3. Изменения (проблема → фикс → файлы)

### Фаза 2: APK через Capacitor (07.10.2026)

- **Решение пользователя**: debug-подпись, сборка APK в GitHub Actions (Java локально нет),
  всё в `main`. `@capacitor/core|cli|android@8.5.2` — **точная** версия в devDependencies
  inventory-app (8.5.3 вышла <24 ч назад → отсекается `minimumReleaseAge: 1440`; при
  обновлении брать версию старше суток).
- **`capacitor.config.ts` — режим `server.url`** (WebView открывает реальный сайт, дефолт
  `https://157-228-160-86.sslip.io`, переопределяется env `APP_URL`): это **единственно
  возможный** режим при `sameSite: "lax"` (инвариант 11) — bundled-режим (`capacitor://`
  origin) делал бы запросы cross-site, и session-cookie не ушла бы на API. В bundle копируются
  ассеты (нужны только для `webDir`), `androidScheme: "https"`, `backgroundColor: "#1a222e"`.
- **Android-проект** `artifacts/inventory-app/android/` — коммитится целиком; его собственный
  `.gitignore` уже исключает `app/src/main/assets/public`, `capacitor.config.json`,
  `capacitor.plugins.json` (генерируются `cap sync`); в `.prettierignore` добавлен весь
  каталог `android` (Java/Gradle/XML). `cap sync` прогнан локально (без Java — только copy).
- **Подпись — стабильный debug keystore**: `android/app/stockkeeper-debug.p12`
  (самоподписаный openssl, пароль `android`, alias `stockkeeper`) + `signingConfigs.debug`
  в `android/app/build.gradle`. Без этого gradle генерит свежий `~/.android/debug.keystore`
  на каждом CI-ране → разные подписи → Android откажется ставить APK поверх старого.
  Debug-ключ не является секретом; release-подпись — отдельная задача с секретом пользователя.
- **CI**: `.github/workflows/android.yml` — push в `main` (paths: `artifacts/inventory-app/**`,
  `pnpm-lock.yaml`, workflow) + `workflow_dispatch`; guard `github.repository_owner == 'fast-iq'`;
  пины как в `ci.yml` (checkout@v6, pnpm/action-setup@v4.4.0, setup-node@v6, ubuntu-24.04);
  Java temurin 21 + gradle-cache; `chmod +x gradlew` **обязателен** (в git файл ложится
  `100644` — Windows core.filemode=false); `./gradlew assembleDebug --no-daemon`;
  артефакт `stockkeeper-debug-apk` (90 дней) → Actions → workflow «Android APK» → Artifacts.
  Gradle-сборка локально невозможна (нет Java) — проверяется только в CI.
- **Иконки — исправлен существующий баг PWA**: PNG генерировались из `favicon.svg` (180×180)
  **без масштабирования на канвас** — оранжевый квадрат сидел в левом верхнем углу 512-px
  файла. Перегенерированы `public/icons/*` (192/512 — rx=20%, `icon-maskable`/`apple-touch` —
  full-bleed без прозрачности), Android `mipmap-*` (ic_launcher/ic_launcher_round/ic_launcher_foreground
  под все плотности) и `drawable*/splash.png` (фон `#1a222e` + центрированный квадрат);
  `values/ic_launcher_background.xml` `#FFFFFF` → `#1a222e`. Генератор — одноразовый
  PowerShell-скрипт на System.Drawing (в репо не хранится).
- **Ограничения APK (проверить на устройстве)**: Android WebView **не поддерживает
  getUserMedia** → камерное сканирование штрихкодов в APK не работает (ручной ввод — работает;
  PWA в Chrome — работает; нативный сканер — отдельная будущая задача). Google-вход в WebView
  может блокироваться политиками GIS embedded-webview — проверить; парольный вход гарантирован.
  APK требует интернет; offline — как у PWA. Смена домена = правка дефолта `APP_URL` в
  `capacitor.config.ts` (или env в CI); `versionCode 1`/`versionName "1.0"` бампить при релизе.

### PWA — установка сайта на телефон (07.10.2026)

- `artifacts/inventory-app/public/manifest.webmanifest`: standalone, **относительные**
  `start_url`/`scope`/`icons` (резолвятся от URL манифеста → работают и при корне, и при
  `BASE_PATH`); `background_color`/`theme_color` = `#1a222e` (дефолтная тема `:root`).
- Иконки `public/icons/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png`) — сгенерированы одноразово из `favicon.svg` через headless Edge
  (скрипт во `%TEMP%`, в репо только PNG). Обновление иконок = перегенерация тем же способом.
- `public/sw.js` (см. инвариант 24): на `install` precache оболочки (корень scope),
  network-first навигация + не-`/assets/*`, cache-first `/assets/*` (fallback
  `Response.error()` при обрыве сети), `/api/*` не кэшируется; `skipWaiting` +
  `clients.claim`, чистка старых кэшей. Файл статичный в `public/` (не бандлится Vite)
  — правки напрямую.
- `index.html`: `<link rel="manifest">`, `apple-touch-icon`, `theme-color`,
  `mobile-web-app-capable`. `src/main.tsx`: регистрация `${BASE_URL}sw.js` только в PROD.
- `deploy/docker/Caddyfile`: `Cache-Control: immutable` для `/assets/*`, `no-cache` для всего
  остального, кроме `/api/*` (у API свой `no-store` — не затирать, инвариант 16).
  Синтаксис проверен на VPS отдельным `caddy:2-alpine` (`caddy validate`) до перезапуска
  контейнеров.
- `eslint.config.mjs`: для `**/public/sw.js` добавлены `globals.serviceworker` (иначе
  `no-undef` на `self`/`caches`/`clients`).
- Закоммичено в `2413f74`, CI docker-publish success, задеплоено `server-update.sh`.
  Headless-проверка прода PASS: manifest/иконки/apple-touch 200 (`application/manifest+json`),
  `sw.js` и index — `no-cache`, `/assets/*` — `immutable`, `/api/healthz` — `no-store`
  (инвариант 16 не затёрт), SW контролирует страницу, кэш `stockkeeper-v1` без единой
  записи `/api`, **оффлайн-перезагрузка отдаёт живое приложение**. Установка на телефон —
  через Chrome «Установить приложение» (проверяется пользователем).

### Фото товара: превью в списке и image-прокси (07.10.2026)

- **Проблема**: `photoUrl` заполнялся из поиска источников только если у источника был
  `imageUrl`; HTML-фолэк экстракции ставил `imageUrl: null`, а krepika вдобавок
  **хотлинк-защищает** картинки (`/img_catalog/*.jpg` → 403 на чужой/пустой Referer,
  301 на www + 200 со своим) — превью в списке не появлялось, `onError` молча прятал битую
  картинку.
- **Экстракция**: `htmlRowResults` теперь ищет фото в строке таблицы — сначала `rel`
  якоря (krepika `a.itemFoto rel="/img_catalog/1717.jpg"`), затем `<img>` в ячейке с
  классом `photo|foto|image|thumb`; принимаются только абсолютные http(s) URL с
  расширением `jpe?g|png|webp|avif` (gif-заглушки и `javascript:` отвергаются),
  резолв от `baseUrl` (relative без baseUrl → null).
- **Прокси**: `GET /data-sources/photo?url=…` (`routes/data-sources.ts`, requireAuth,
  rate-limit 300/мин) → `fetchImage` (`services/source-search.ts`) — тот же SSRF-гард
  (инвариант 23), ≤3 редиректов с re-validation, `Referer` = origin картинки
  (проходит хотлинк-защиту), `User-Agent` StockKeeper, лимит 2 МиБ, только
  `content-type: image/*` (иначе 415), ошибки: blocked/invalid → 400, upstream → 502.
  Ответ идёт под глобальным `no-store` (инвариант 16) и мимо SW (инвариант 24) —
  кэширование через API не включать.
- **UI**: `components/ItemThumb.tsx` — общий `photoSrc()` (проксирует любой http(s)
  `photoUrl`; фиксирует и mixed content, и 403) и `ItemThumb` (превью + фоллбэк-плейсхолдер
  `Package` при отсутствии/ошибке загрузки, `failedSrc` сбрасывается при смене URL).
  Используется в `inventory.tsx` (столбец — h-9, мобильная карточка — h-12) и в шапке
  `item-detail.tsx`. В формах (`item-new`, `item-detail`) превью вводимого URL ходит через
  `usePhotoPreview` (debounce 400 мс — один запрос на остановку ввода, а не на каждую
  букву).
- **openapi**: путь `/data-sources/photo` + `getSourcePhoto`; `pnpm --filter
@workspace/api-spec codegen` прогонен (client+zod); в `postprocess-generated.mjs`
  добавлен перепис zod v4 `zod.url()` → `zod.string().url()` (иначе typecheck и
  google-auth тесты падают на `format: uri`).
- **Тесты**: `tests/source-search.test.mjs` — +4 (извлечение фото из HTML-строк,
  Referer/байты fetchImage, блокировки/`bad-format`, редиректы/размер/статус), всего 22.
- **ВНИМАНИЕ (урок сессии)**: не запускать `pnpm run format | Select-Object -First N` —
  раннее закрытие пайплайна убивает prettier посреди `writeFile`, файл обнуляется
  (так потерялся AGENTS.md и попал в коммит `aa7f0b2`; восстановлен из `5a0fe9d`).
  Длинный вывод — без `First`, либо писать во временный файл.

### Источники сбора данных (06.10.2026)

- **Задача**: в карточке товара секция «артикул/ШК + количество + провайдер (шаблон URL)» →
  серверный прокси подтягивает данные (название/цена/ссылка) в приложение.
- **Схема**: `lib/db/src/schema/data-sources.ts` — таблица `data_sources` (id serial, userId →
  users cascade NOT NULL, name, urlTemplate, createdAt, unique `(userId, name)`), экспорт из
  `schema/index.ts`. Миграция **`lib/db/migrations/0001_data_sources.sql`** (тег/`when` в
  journal `meta/_journal.json` менять нельзя — инвариант 22): обычная `CREATE TABLE`
  (без `public.`-квалификатора) + inline FK + unique index; `drizzle-kit generate` подтверждает
  «No schema changes». Свежий сценарий миграций: 12 таблиц / 16 FK / 4 индекса / journal = 2.
- **API** (`artifacts/api-server/src/routes/data-sources.ts`, подключён в `routes/index.ts`):
  `GET /data-sources` (встроенные WB/Ozon/Авито/Мегамаркет/Яндекс.Маркет сидируются только при
  пустом списке — удалённые вручную не воскресают, пока есть хоть один источник),
  `POST /data-sources` (zod `CreateDataSourceBody` → `validateTemplateSyntax` → 409 на дубль
  имени по `23505`), `DELETE /data-sources/:id` (owner-only, 204/404),
  `POST /data-sources/search` (`SearchDataSourcesBody`, rate-limit 30/мин по userId,
  источник чужой → 404).
- **Сервис** `services/source-search.ts`: `buildSearchUrl` (`{sku}`/`{barcode}` →
  encodeURIComponent), SSRF-гард (инвариант 23), `fetchValidated` (redirect: manual, ≤3 с
  повторной валидацией, AbortSignal.timeout 8с, стриминговый лимит 2 МиБ), экстрактор
  JSON (`hits`/`products`/`items`/`results`/`data` + `offers`, WB `salePrice.u`) →
  JSON-LD (`Product`/`ItemList`) → og-meta, до 10 результатов, `parsePrice` без unsafe-regex.
  Ошибки источника (timeout/network/too-large/bad-format/redirect-loop) → ответ
  `200 {results: [], sourceError: <code>}` — UI переводит код; блок SSRF/плохой шаблон → 400.
- **openapi + codegen**: пути `/data-sources`, `/data-sources/search`, `/data-sources/{id}`;
  схемы `DataSource`, `CreateDataSourceBody`, `SearchDataSourcesBody`, `SourceSearchResult{,Item}`;
  `pnpm --filter @workspace/api-spec codegen` обновил `lib/api-client-react` (хуки
  `useListDataSources`/`useCreateDataSource`/`useDeleteDataSource`/`useSearchDataSources`)
  и `lib/api-zod`.
- **HTML-фоллбэк экстракции (06.10.2026)**: если в ответе нет JSON/JSON-LD/og,
  `extractResults` разбирает таблицы-листинги: строка `<tr>` с якорем в `<td>`
  (текст 4–300 символов, не asset/`javascript:`/`mailto:`) + **первая
  standalone-числовая ячейка после якоря** = цена; ссылки резолвятся от
  `baseUrl` (передаётся `startUrl` из `searchDataSource`). Число проверяется
  char-scan'ом `isStandaloneNumber` (не regex — гейт `detect-unsafe-regex`).
  Порядок: JSON → JSON-LD → HTML-строки → og-meta. Юнит-функция покрыта
  тестами, на реальной выдаче krepika.ru даёт 10 товаров с ценами.
- **Встроенный источник «Крепика (krepika.ru)»** (`https://krepika.ru/search/?query={sku}` —
  параметр поиска именно `query`, не `q`; `?q=` молча игнорируется). Сидируется
  только при ПУСТОМ списке; у существующих аккаунтов добавить вручную (UI
  «Управление источниками» или разовый INSERT в `data_sources`).
- **UI**: `components/SourceSearch.tsx` в правой колонке `item-detail.tsx` — префилл запроса из
  `sku || barcode`, количество (для «итого за N шт»), список источников, «Найти», результаты с
  «Взять цену» (PATCH `price` + инвалидация кэшей) и ссылкой на страницу, управление своими
  источниками (добавить/удалить с подтверждением); ru/en ключи `sources.*` в `locales/*.json`.
- **Страница создания** (`pages/item-new.tsx`, 06.10.2026): секция `<SourceSearch mode="new">`
  первой карточкой **вне `<form>`** (внутри формы вложенная `<form>` управления источниками —
  invalid HTML). Колбэк `onApply(r, {query, quantity})` заполняет поля новой карточки: `name`
  (title), `price` (price, если не null), `photoUrl` (imageUrl, если есть), `sku` (текст запроса
  поиска), `notes` (url результата — только если заметки пусты или последняя запись была
  автозаполнена; ручное редактирование снимает флаг `notesAuto`), `quantity` (количество из
  секции источников, если >0) — кнопка результата «Заполнить карточку» (без условия
  `price != null`, в отличие от detail-режима). Поля формы `name`/`price`/`description`/`sku`/
  `quantity`/`notes` переведены в controlled state (иначе программная запись не видна submit'у
  через `FormData`); `itemId` в компоненте опционален, PATCH-ветка — только detail-режим.
- **Количество — только целое** (`items.quantity` integer в БД): `POST`/`PATCH /items` проверяют
  `quantityError()` (integer, 0…2147483647) → 400 вместо 500 от PG (поймано на проде: дробное
  23.97 валилось в integer-колонку); на форме `step="1"` + клиентская проверка с тостом
  `itemNew.quantityNotInteger`. Та же правило уже есть в transfer-validation (импорт) — не дублировать
  по-другому.
- **Тесты**: `tests/source-search.test.mjs` (18 шт., injectable fetch/DNS, без сети: шаблоны,
  SSRF-блоки, редиректы, лимиты, экстракция JSON/JSON-LD/HTML-таблицы/og, orchestration) + скрипт
  `test:sources`, включённый в корневой `pnpm test`. Обновлён `migrations.integration.test.mjs`
  (12/16/4/journal=2) — локальный прогон требует PostgreSQL с ролью `transfer_test`
  (Docker/WSL сейчас недоступны, см. §6 — прогнать в CI или после восстановления Docker).
- **Проверки**: format:check, lint (0/0), typecheck, test (весь корневой прогон, включая
  18 sources-тестов), build,
  `git diff --check`, `drizzle-kit generate` — успешно. Audit: устранены 4 новых advisory
  (см. §3.1), остаётся известный `braces` (high, без патча).

### Штрихкод и камера

- `items.barcode` уже был в схеме/API и JSON/XLSX: нового столбца или миграции
  не требуется. Штрихкод остаётся строкой, в том числе с ведущими нулями.
  `GET /items?search=…` теперь ищет также по штрихкоду с ограничением по владельцу.
- Поле штрихкода перенесено в основные сведения при создании. Общие
  `BarcodeInput`/`BarcodeScanButton` используются при создании, редактировании
  и поиске. Сканирование сразу запускает поиск и сбрасывает фильтры
  категории/места, чтобы не скрыть найденный товар.
- ZXing декодирует видео локально; модуль выделен в лениво загружаемый
  barcode-chunk. Запрашивается только видео с предпочтением задней камеры,
  без микрофона. Камера запускается после нажатия, останавливается при
  распознавании, закрытии, размонтировании и уходе вкладки в фон.
  Поздний результат запроса разрешения после закрытия тоже останавливается.
- Отказы доступа, отсутствие/занятость камеры, неподдерживаемый браузер
  и отсутствие HTTPS объясняются на ru/en; ручной ввод остаётся доступен.
  `Permissions-Policy`: камера только same-origin, микрофон/геолокация запрещены.
- `test:barcode` запускает отдельный мобильный browser-сценарий через
  существующий защищённый runner. Проверены настоящие EAN-13 кадры через
  canvas MediaStream и реальный декодер, создание/сохранение/reload,
  ручной поиск с ведущими нулями, поиск камерой, отказ доступа,
  закрытие до завершения запроса камеры и отсутствие горизонтального переполнения.
  Запускать только с локальной `stockkeeper_transfer_test`, ролью `transfer_test`
  и `NODE_ENV=test`; в Replit использовать
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/repl/tools/bin/chromium`.
- Пройдены 39 быстрых тестов и 11 интеграционных, включая поиск штрихкода,
  изоляцию аккаунтов и сохранение штрихкода в JSON/XLSX.
  `format:check`, `lint`, `typecheck`, `build` прошли. Аудит по-прежнему
  сообщает существующий GHSA-vfj7-8cjw-p6xm в `braces` через mockup-sandbox;
  новых проблем в добавленных зависимостях не обнаружено.

### Некорректный профиль при сверке языка

- `tests/language.browser.test.mjs`: восемь сценариев en-US/ru-RU теряют
  ответ реально выполненного PATCH, затем подают GET с HTTP 500,
  повреждённым JSON, недопустимым языком или другим id пользователя.
- Автоматическая и ручная неудачная сверка должны сохранять предупреждение,
  прежние переводы/localStorage и профиль в UI без даже краткого подтверждения.
  Корректный ручной GET снимает предупреждение и подтверждает сохранённый язык
  без повторного PATCH; reload сохраняет результат. Используются только
  существующий browser-harness, loopback-БД и синтетические аккаунты.
- Проверки: все восемь новых сценариев прошли единым отдельным прогоном.
  Все 26 языковых и шесть сценариев обмена данными прошли при раздельных
  запусках: общий прогон превышает лимит 300 секунд в Replit.
  `format:check`, `lint`, `typecheck`, `test`, `build` прошли.
  `audit --audit-level=high` выявил существующий GHSA-vfj7-8cjw-p6xm
  в `braces` через `mockup-sandbox > fast-glob > micromatch`; зависимости
  в рамках этой тестовой задачи не изменялись.

### Цены по магазинам

- `shops`, `item_prices`, `price_settings`: отдельные таблицы аккаунта.
  В `item_prices` сумма за единицу, магазин, календарная дата цены и время
  добавления. Доступ и ссылки проверяются по владельцу; удаление товара
  каскадно удаляет его историю цен.
- Выбранная цена вычисляется на сервере для списка, карточки и ответов
  создания/редактирования. Сначала берётся последняя запись каждого магазина
  по дате цены, затем по времени добавления и ID; после этого — минимальная
  сумма либо последняя дата согласно настройке аккаунта. Ноль — допустимая цена.
- `items.price` не удаляется: старые значения остаются как `legacyPrice`
  без выдуманных магазина и даты и служат запасным значением, когда нет
  магазинных цен. Обычная форма редактирования не должна записывать обратно
  вычисленную цену. Копирование товара переносит историю цен транзакционно.
- В карточке доступны добавление, редактирование и удаление цен с подтверждением.
  Настройка цены сохраняется независимо от настройки языка.
- JSON версии 2 включает магазины и историю цен; версия 1 принимается.
  В XLSX — отдельные листы «Магазины» и «Цены» со ссылочными ID.
  При импорте владельцы назначаются сервером, ID переназначаются, существующие
  данные не обновляются. В режиме skip цены сопоставляются по товару,
  магазину, сумме и календарной дате.
  Для товаров и цен совпадения потребляются по одному: разные ID одной
  копии не сливаются, даже если их реквизиты совпадают; повторный импорт
  сохраняет количество и независимость историй. Порядок сопоставления
  стабилен по ID существующих записей.
- Календарные даты цены передаются строками YYYY-MM-DD: `format: date`
  при текущем Orval useDates/coerce превращает их в Date, поэтому контракт
  использует строковый pattern с серверной проверкой реального календарного дня.
- `lib/db/sql/shop-prices.sql` оставлен только как историческая ссылка; источник
  истины — отслеживаемая миграция `lib/db/migrations/0000_shop_price_history.sql`.
  Она идемпотентно добавляет `items.price`, `shops`, `item_prices` и
  `price_settings`, сохраняя существующие строки. Drizzle snapshot хранит полную
  текущую схему для следующих `generate`.
- Production API применяет миграции до `listen` только через `EXTERNAL_DB_URL`;
  если он не задан, запуск завершается без fallback на Replit `DATABASE_URL`.
  Секрет задаётся в Publishing. Post-merge runner Development использует только
  `DATABASE_URL`. Не выполнять ручные изменения внешней Production-БД.
- Проверки: повторный `generate` сообщил отсутствие schema drift; интеграционный
  тест дважды применил миграцию в случайной схеме временной БД, сохранил старую
  строку и проверил таблицы и журнал. Прошли `format:check`, `lint`, `typecheck`,
  `test`, `test:data-transfer:integration` и API build. Внешняя Production-БД
  не проверялась и не изменялась; новая версия сможет применить миграции при
  следующей публикации.
- Проверки: lint без предупреждений, 39 тестов, typecheck и сборка всех
  workspace-пакетов — успешно.
  Браузерная проверка: CRUD цен, режим и его сохранение, legacy-цена,
  копирование, JSON/XLSX, чужой аккаунт и телефонный экран.
  Найденное смешивание историй одинаковых товаров при импорте исправлено;
  последующая проверка реального API в новых аккаунтах подтвердила сохранение
  двух самостоятельных товаров, пяти цен (включая повторяющиеся суммы/даты)
  и отсутствие новых записей при повторном импорте для JSON и XLSX.

### Зависшее соединение при сохранении языка

- `artifacts/inventory-app/src/pages/settings.tsx`: отдельный AbortController
  и предел ожидания 10 секунд для PATCH и автоматической/ручной GET-сверки,
  включая чтение тела ответа. После таймаута обеих операций снимается блокировка,
  показывается прежнее предупреждение о неподтверждённом результате.
  Отказ HTTP остаётся отказом; PATCH никогда не повторяется автоматически.
- `tests/language.browser.test.mjs`: четыре сценария en-US/ru-RU удерживают
  PATCH и GET без ответа/обрыва, включая повторную ручную сверку. Проверены
  как реально записанный PATCH с задержанным ответом, так и не отправленный
  на сервер запрос. Часы браузера ускоряют только штатные таймеры приложения.
  После восстановления GET принимает фактический язык сервера, без нового PATCH.
- Проверено на отдельном временном loopback PostgreSQL с синтетическими
  аккаунтами: языковой набор 18/18, без пропусков, неизменность остальных
  данных и другого аккаунта. Рабочие базы, Google и внешняя сеть не используются.
  После завершения тестовых схем — 0. format:check, lint (0 warnings),
  обычные тесты 29/29 и build с typecheck прошли. Audit сообщает прежнюю
  high-уязвимость braces в mockup-sandbox (GHSA-vfj7-8cjw-p6xm);
  зависимости в этой задаче не менялись.

### Смена аккаунтов на общем телефоне

- `artifacts/inventory-app/tests/language.browser.test.mjs`: en-US/ru-RU,
  два синтетических аккаунта в одном mobile/touch-контексте 390×844.
  Четыре смены A → B → A → B → A выполняют выход через выдвижной Sidebar
  и парольный API-вход без очистки cookie/localStorage и создания нового контекста.
- Разные серверные ru/en/auto заменяют старый localStorage; auto после
  противоположного явного языка возвращает язык браузера. Проверяются профиль
  API/БД, email нового пользователя, выбранная кнопка, все ссылки нижней панели
  и выдвижного Sidebar. SPA-возврат в настройки удерживает фоновые GET профиля:
  интерфейс обязан использовать новый профиль из React Query без reload.
- Стенд прежний: loopback-БД со случайной схемой, блокировка внешней сети,
  очистка браузера/Vite/API/схемы. Данные обоих аккаунтов не меняются.
  Runtime-код, Google, импорт/экспорт и сценарии ошибок сохранения не изменены.
- Проверено в Replit/Linux: весь языковой набор 14/14 без пропусков,
  тестовых схем после завершения — 0. format:check, lint (0 warnings),
  обычные тесты 29/29 и build с typecheck прошли. Audit по-прежнему сообщает
  high-уязвимость braces в mockup-sandbox (GHSA-vfj7-8cjw-p6xm);
  зависимости не менялись.

### Сохранение выбранного языка

- При потере ответа PATCH настройки сверяют GET `/api/auth/me` без кэша
  и принимают язык только из профиля того же пользователя с допустимым
  значением `ru`/`en`/`auto`. Проверенный профиль обновляет кэш и localStorage;
  вместо обычного «сохранено» показывается отдельное сообщение о сверке.
  Если GET недоступен, прежний язык интерфейса сохраняется, отображается
  предупреждение и кнопка «Проверить сохранённый язык» — только GET, без
  повторной записи. HTTP-отказ PATCH остаётся обычной ошибкой сохранения.
- `tests/language.browser.test.mjs`: четыре новых сценария en-US/ru-RU
  выполняют реальный PATCH через `route.fetch()`, дочитывают успешный ответ
  и обрывают его доставку браузеру. Проверяются удержанный/недоступный GET,
  отсутствие преждевременных уведомлений, единственный PATCH, восстановление
  через GET, согласованность БД/API/localStorage/интерфейса/кэша при навигации,
  reload и чистом парольном входе с противоположным locale, включая `auto`.
  Только существующий loopback browser-harness и синтетические аккаунты;
  данные другого аккаунта и предметы не меняются. Проверки в Replit/Linux:
  языковой набор 12/12 без пропусков, lint 0 warnings, format:check,
  обычные тесты 29/29 и build с typecheck успешны. Audit сообщает прежнюю
  high-уязвимость braces в mockup-sandbox (GHSA-vfj7-8cjw-p6xm).
- `tests/language.browser.test.mjs`: отдельные мобильные сценарии en-US/ru-RU
  используют viewport 390×844, `isMobile` и `hasTouch`, выбирают ru/en/auto
  через штатные настройки касаниями. Для каждого выбора проверяются PATCH,
  БД/API/localStorage, выбранная кнопка после reload и чистого парольного
  API-входа с противоположным locale. Auto снимает прежний явный выбор.
  Проверяются все пять переводов нижней панели, заголовок/ссылки/выход
  выдвижного Sidebar, переход из меню в товары и возврат нижней панелью.
  Desktop-sidebar скрыт; используется прежний browser-harness с изолированной
  loopback-БД, блокировкой внешней сети и очисткой. Google, импорт/экспорт
  и настройки приложения не менялись. Языковой набор в Replit/Linux: 8/8,
  включая два новых мобильных сценария, без пропусков; тестовых схем после
  прогона не осталось. Общие проверки: format:check, lint (0 warnings),
  обычные тесты 29/29 и build с typecheck — успешно. Audit сообщает прежнюю
  high-уязвимость braces в mockup-sandbox (GHSA-vfj7-8cjw-p6xm);
  зависимости в этой задаче не менялись.
- `tests/language.browser.test.mjs`: ошибки PATCH HTTP 500 и обрыв связи
  проверяются в en-US/ru-RU. Запрос удерживается до проверки блокировки
  кнопок; после ошибки проверяются сообщение, отсутствие даже кратковременного
  success-toast, прежний язык в БД/API/localStorage и кэше профиля при переходах.
  Кнопки снова доступны, автоматического повтора нет; явный повтор успешно
  сохраняет новый язык, который остаётся после reload. Ошибки подменяются
  только у PATCH; loopback-стенд и запрет внешней сети сохранены.
- Проверки ошибок и явного повтора в Replit/Linux: браузерный набор 12/12
  (включая 4 новых сценария), обычные тесты 29/29, lint без предупреждений,
  format:check и build с typecheck — успешно. Audit по-прежнему сообщает
  high-уязвимость braces (GHSA-vfj7-8cjw-p6xm) в mockup-sandbox.
- В штатных настройках добавлен `auto` («Автоматически»), доступное состояние
  выбора `aria-pressed` и блокировка кнопок на время сохранения. При успешном
  PATCH обновляются профиль в React Query и язык; при ошибке показывается
  сообщение без ложного успеха и локального изменения.
- `src/i18n/index.ts` хранит предпочтение отдельно от определённого языка.
  Автоматический режим не кэширует найденный `ru`/`en` вместо `auto`.
  Sidebar применяет все три значения из серверного профиля; настройки
  синхронизируют выбранную кнопку после получения профиля.
- `tests/language.browser.test.mjs`: два сценария en-US/ru-RU выбирают все
  три режима через настройки; проверяют PATCH, БД, auth/me, localStorage,
  выбранную кнопку, переведённые заголовки и Sidebar, переходы по спискам,
  reload и вход парольным API в чистом контексте с противоположным locale.
  Auto проверяется после явного противоположного языка, а также после logout
  и повторного входа; данные своего и другого аккаунтов не меняются.
- Общий запуск/очистка браузера, Vite и API вынесены в
  `tests/helpers/browser-harness.mjs`; `corepack pnpm test:browser` и существующий
  CI job запускают также языковые сценарии. Guard loopback-БД, случайная схема,
  синтетические аккаунты, блокировка внешней сети и пустой Vite envDir сохранены.
  Google sign-in, рабочая БД, startup/build и настройки публикации не менялись.
- Проверено в Replit/Linux: браузерные сценарии 8/8 на отдельном PostgreSQL 16,
  обычные тесты 29/29, lint (0 warnings), build с typecheck — успешно.
  Audit сообщает прежнюю high-уязвимость braces в mockup-sandbox
  (GHSA-vfj7-8cjw-p6xm); зависимости не менялись.

### Перенос копий в русском интерфейсе

- `artifacts/inventory-app/tests/data-exchange.browser.test.mjs`: отдельные
  JSON/XLSX-сценарии с `ru-RU`, штатным определением языка и синтетическими
  аккаунтами с языком auto; английские desktop/mobile-сценарии сохранены.
- Русские подписи читаются из `artifacts/inventory-app/src/i18n/locales/ru.json`:
  предпросмотр и его счётчики, доступные названия подтверждения/режимов/кнопки,
  результат с созданными/пропущенными записями и ссылки товаров/покупок.
- Проверяются отсутствие записи до подтверждения, отключение импорта при снятии
  галочки, повторный skip/add и обновление ранее открытых списков без reload.
  Loopback-БД, внешняя сетевая блокировка и очистка сохранены; новые сценарии
  не дублируют повреждённые/большие файлы, конкурентное редактирование или Google.
- Проверено в Replit/Linux: браузерные сценарии 6/6 на отдельном PostgreSQL 16;
  после завершения тестовых схем не осталось. format:check, lint (0 warnings),
  обычные тесты 29/29 и build с typecheck прошли. Audit сохраняет известную
  high-уязвимость braces в mockup-sandbox (GHSA-vfj7-8cjw-p6xm);
  зависимости и runtime-код приложения не менялись.

### Повторный импорт на телефоне

- `artifacts/inventory-app/tests/data-exchange.browser.test.mjs`: отдельные
  JSON/XLSX-сценарии с viewport 390×844 и touch/mobile; desktop 1280×900 сохранён.
- Подтверждение и переключение skip/add проверяются через UI, все счётчики —
  в ответе API и на экране. После skip ровно 2 карточки товаров и 1 покупка,
  после add — 4 и 2; скрытая desktop-таблица не участвует в подсчёте.
- Переходы идут через нижнюю мобильную панель и выдвижное меню без reload.
  Сохранены loopback guard, случайная схема, синтетические аккаунты и очистка.
  Повреждённые/большие файлы, конкурентное редактирование и Google sign-in
  в мобильный сценарий не добавлены. Запуск описан в README API-тестов.
- Проверено в Replit/Linux: браузерные сценарии 4/4 на отдельном PostgreSQL 16;
  format:check, lint (0 warnings), обычные тесты 29/29, build с typecheck —
  успешно. Audit сообщает прежнюю high-уязвимость braces в mockup-sandbox
  (GHSA-vfj7-8cjw-p6xm); зависимости не менялись.

### Повторный импорт: браузерная проверка skip и add

- `artifacts/inventory-app/tests/data-exchange.browser.test.mjs` повторно загружает
  одну и ту же успешно восстановленную JSON/XLSX-копию через UI: переключает radio,
  проверяет отправленный mode и неизменность данных копии в запросе.
- Skip показывает 3 пропуска и нулевые created-счётчики; полный снимок записей
  остаётся неизменным. Add показывает 2 товара и 1 покупку, создаёт ровно по одной
  копии с новыми ID и сохраняет оригиналы/справочники.
- После каждого режима проверяются обновление активного запроса и точное число
  строк в ранее открытых списках товаров/покупок через SPA без reload.
  Защита отдельной БД, синтетические аккаунты и очистка не изменены.
- Сценарии не включают конкурентное редактирование или Google sign-in.
- Проверено в Replit/Linux: браузерные JSON/XLSX-сценарии 2/2 на отдельном
  PostgreSQL 16; format:check, lint (0 warnings), обычные тесты 29/29,
  build с typecheck — успешно. Audit сохраняет ранее известную high-уязвимость
  braces в mockup-sandbox (GHSA-vfj7-8cjw-p6xm); зависимости не менялись.

### Подтверждение импорта: воспроизводимая браузерная регрессия

- `artifacts/inventory-app/tests/data-exchange.browser.test.mjs` проверяет
  настоящее React-приложение в Chromium для JSON/XLSX: preview без записи,
  обязательное подтверждение, сброс при замене файла, блокировки во время import,
  сохранение preview после поздней ошибки PostgreSQL и явный повтор.
- Счётчики проверяются в API и интерфейсе; успешный import обновляет активный
  запрос, а ранее открытые товары/покупки показывают новые данные через SPA,
  без reload. Исходный и посторонний аккаунты не изменяются.
- Запуск `corepack pnpm test:browser` очищает окружение дочернего процесса
  и использует существующий `transferHarness`; он теперь возвращает адрес
  тестового API для локального proxy. Никаких изменений runtime DataExchange,
  Google auth, рабочих БД или пользовательских файлов.
- CI job `Backup restore (PostgreSQL)` устанавливает Chromium и запускает
  браузерную проверку после API-тестов. Установка/локальный запуск/очистка
  описаны в `artifacts/api-server/tests/README.md`.
- Проверено в Replit/Linux: JSON/XLSX 2/2 на отдельном PostgreSQL 16,
  с синтетическими аккаунтами и временными схемами.
- Общие проверки: format:check, lint (0 warnings), обычные тесты 29/29,
  API-интеграция 10/10 и build (включая typecheck) — успешно.
  `audit --audit-level=high` по-прежнему сообщает известную high-уязвимость
  `braces <=3.0.3` в mockup-sandbox (GHSA-vfj7-8cjw-p6xm); она не относится
  к добавленным браузерным тестам и здесь не исправлялась.

### Регрессии восстановления копий: реальная БД в CI

- `artifacts/api-server/tests/data-transfer.integration.test.mjs`: 10 сценариев
  через настоящее Express-приложение, session-cookie и PostgreSQL. JSON/XLSX
  проходят экспорт → preview → import в отдельных аккаунтах, с проверкой ID,
  связей покупок, категорий, мест и единиц; preview не пишет данные.
- Повторный skip после PATCH цены/остатка и форматирования тегов не создаёт
  строк и не обновляет существующие данные. Проверены также add, параллельный
  skip и XLSX «Метрика» с отдельными остатками дома/в гараже.
- Проверяются чужие ссылки/подмена владельца, 401/404, ошибка валидации без
  записи и транзакционный откат при поздней ошибке PostgreSQL.
- `tests/helpers/transfer-test-database.mjs`: guard подключения до SQL,
  генерация DDL из текущей Drizzle-схемы в случайную тестовую схему, проверка
  runtime search_path, очистка только этой схемы. Секреты приложения не нужны.
- `tests/run-transfer-integration.mjs` запускает тесты в дочернем процессе
  с allowlist окружения; `tests/transfer-test-safety.test.mjs` проверяет
  отказ запуска при небезопасном/отсутствующем URL, без подключения к БД.
- CI: отдельный job `Backup restore (PostgreSQL)` с PostgreSQL 17 service,
  `pnpm test:integration`, без Production Secrets и DDL в build/startup.
  Локальный запуск описан в `artifacts/api-server/tests/README.md`.
- Проверено в Replit/Linux: интеграционные сценарии 10/10 на отдельном
  PostgreSQL 16; обычные тесты 28/28, lint без warnings, build (с typecheck)
  и audit --audit-level=high успешно.

### Подготовка Docker-развёртывания (04.10.2026)

- `deploy/docker/` содержит отдельные образы веб-интерфейса и API: Caddy
  раздаёт SPA и проксирует `/api`, PostgreSQL остаётся на хосте и не включён
  в Compose.
- Контейнер API использует `EXTERNAL_DB_URL`; Production startup применяет
  миграции до начала приёма запросов. Сборка образа не запускает сервер и не
  подключается к БД. Не запускать Compose против Production без отдельного
  согласования целевой БД и проверки резервной копии.
- Compose не публикует PostgreSQL. API использует `host.docker.internal`;
  ограничить доступ к БД сетью контейнера и не открывать порт БД публично.
- Веб-контейнер получает TLS от Caddy только после настройки работающего DNS
  имени и доступности портов 80/443. Не считать конфигурацию готовой к
  публичному запуску, пока DNS не разрешается.
- Runtime environment-файл хранить только на Docker-хосте вне репозитория;
  не добавлять значения Production secrets в GitHub.
- `.github/workflows/docker-publish.yml` публикует приватные API/web-образы в
  GHCR по push в `main` и ручному запуску только для `main`; права ограничены
  `contents: read` и `packages: write`. Перед login/build обеих публикаций
  workflow требует Actions repository variable `VITE_GOOGLE_CLIENT_ID`; это
  публичный OAuth client ID, а не секрет. В Compose использовать опубликованные
  `ghcr.io/fast-iq/stockkeeper-api` и `stockkeeper-web`, по умолчанию `latest`;
  на хосте для pull нужен GHCR `read:packages`. OAuth ID в веб-сборке и
  runtime `GOOGLE_CLIENT_ID` API должны совпадать.
- Docker workflow только собирает и публикует образы: не запускать Compose,
  production API или миграции из GitHub Actions.
- На 04.10.2026 Actions repository variable `VITE_GOOGLE_CLIENT_ID` ещё не
  задана. Первый workflow-run остановится с понятной ошибкой до GHCR login и
  публикации; чтобы получить образы, пользователь должен добавить публичный
  OAuth client ID в Actions Variables и перезапустить workflow.
- Проверки 04.10.2026: `docker compose config --quiet`, сборка обоих образов,
  `caddy validate`, `format:check`, lint, typecheck, тесты, build и
  `git diff --check` прошли. `pnpm audit --audit-level=high` сообщает о
  существующей high-уязвимости `braces` (см. ниже). Production-сервисы не
  запускались; временный контейнер использован только для проверки Caddy.
  Предыдущая Docker-подготовка не запускала Production-сервисы или миграции.
  Настройка публикации GHCR описана выше и в `deploy/docker/README.md`.
- Проверки изменений GHCR: `yq` разобрал workflow и Compose YAML, Compose
  конфигурация проверена с синтетическими непроизводственными значениями;
  `format:check`, lint, typecheck, тесты, build и `git diff --check` прошли.
  Audit остаётся на прежней high-уязвимости `braces`. Публикация образов и
  Production-сервисы в проверках не запускались.
- `compose.yaml` дополнен секциями `build:` для api и web (context — корень
  репо, относительно файла compose; web получает build-arg
  `VITE_GOOGLE_CLIENT_ID` из `GOOGLE_CLIENT_ID`). Это позволяет собрать образы
  локально на Docker-хосте до первой успешной публикации GHCR (Actions-переменная
  `VITE_GOOGLE_CLIENT_ID` не задана); путь `pull` из GHCR сохранён, README
  дополнен разделом локальной сборки.

### Product-БД на внешнем сервере: развёртывание схемы (04.10.2026)

- БД `stockkeeper` на `83.147.243.54:6543` (строка подключения — секрет,
  передавалась вне репо; в код/AGENTS её не записывать). Строка указана в
  Docker-как `EXTERNAL_DB_URL` для Production.
- Состояние до: PostgreSQL 17.11, **пустая** — только `public.__drizzle_migrations`
  (0 строк), ни одной из 11 таблиц приложения, журнал миграций пуст.
- Выполнено (с согласия пользователя): `drizzle-kit push` (создал все 11 таблиц),
  затем `migrate` (записал `0000_shop_price_history` в журнал; все statement'ы
  идемпотентны — стали no-op).
- **Как запускать push неинтерактивно**: `--config` нельзя комбинировать с
  прочими флагами — передавать `--url/--dialect/--schema` явно; вопрос
  «created or renamed» (из-за пары journal-таблица ↔ первая таблица схемы)
  обходится фильтром
  `--tablesFilter "users,categories,units,locations,items,shopping_list,password_reset_tokens,session,shops,item_prices,price_settings"`.
  `--force` не нужен. После DDL push пытается выполнить
  `DROP SEQUENCE __drizzle_migrations_id_seq` (таблица отфильтрована из
  сравнения) и падает с `2BP01` — безвредно: к этому моменту все CREATE/ALTER
  уже выполнены, sequence и журнал остаются на месте.
- Повторный запуск `migrate` на этой БД безопасен (adoption-миграция
  идемпотентна). Идти через `getProductionMigrationUrl` (EXTERNAL_DB_URL) —
  штатный путь Production/Docker startup.
- Итог проверки read-only-компаратором со snapshot `meta/0000_snapshot.json`:
  **11/11 таблиц, 74/74 колонки, типы/дефолты/NULL/PK совпадают, FK 15/15,
  все индексы (`session_expire_idx`, `shops_owner_name_key`,
  `item_prices_owner_item_shop_date`, unique-индексы), журнал 1=1**;
  данные пустые (users/items/item_prices = 0). Соответствие схеме — полное.
- Файлы компараторов — во `%TEMP%\opencode\stores\` (`db1-3.js`,
  `verify2.js`), в репо не копировать.

### Полная схема на пустой БД при старте API (04.10.2026)

- Проблема: на чистой PostgreSQL `0000_shop_price_history` падал на `ALTER TABLE "items"`
  (таблиц нет): базовая схема исторически создавалась только `drizzle-kit push`, а
  Production startup (`artifacts/api-server/src/index.ts` → `runDatabaseMigrations`) выполняет
  только журнальные миграции — контейнер API на пустой БД не поднимался.
- Фикс: `lib/db/migrations/0000_shop_price_history.sql` расширен до полного идемпотентного
  baseline — 11 таблиц,15 inline-FK (имена из `meta/0000_snapshot.json`),3 индекса, все
  `CREATE … IF NOT EXISTS`; адоптационная дельта сохранена в конце. Тег и journal-`when`
  не менялись — существующие БД запись пропускают (сравнение `created_at` ↔ `folderMillis`,
  hash не используется). Сгенерированный `drizzle-kit` вывод приведён к inline-FK без
  квалификатора `public.` (иначе падает легаси-сценарий и тесты со случайной схемой).
  `drizzle-kit generate` подтверждает: «No schema changes» (drift отсутствует).
- Тест: в `artifacts/api-server/tests/migrations.integration.test.mjs` добавлен сценарий на
  пустой случайной схеме — 11 таблиц,15 FK,3 индекса, журнал=1, повторный запуск без изменений;
  существующий легаси-сценарий сохранён.
- Проверки: `format:check`, lint (0 warnings), typecheck, test (42 pass + 1 skip), build —
  успешно; интеграционный runner 13/13 (11 обмена данными + 2 миграций) на отдельном
  PostgreSQL 17 в Docker; смоук собранного `dist/index.mjs` с `NODE_ENV=production` на
  абсолютно пустой БД: «Production database migrations are up to date», healthz 200,
  в БД 11 таблиц / journal 1 / FK 15.

### Развёртывание на VPS (04.10.2026, выполняется пошагово)

- Сервер: Debian 13, **157.228.160.86** (хост менялся: vm4190214 → vm4717441), диск ~8.8 ГБ —
  образы на хосте НЕ собирать (ENOSPC), только pull из GHCR; пакеты
  `fast-iq/stockkeeper-api|web` публичны (без docker login). Репо клонирован в `/opt/stockkeeper`;
  функция обвязки: `dc() { docker compose --env-file /etc/stockkeeper/stockkeeper.env -f /opt/stockkeeper/deploy/docker/compose.yaml "$@"; }`
  (в новой сессии shell функцию объявить заново).
- PostgreSQL 17 локально на хосте: БД/роль `stockkeeper`, `listen_addresses='*'`,
  pg_hba `172.16.0.0/12 scram-sha-256`; порт **5432 закрыт от интернета** (проверено снаружи).
- **ufw active** (deny incoming): `22/tcp`, `80/tcp`, `443` (tcp+udp — нужен для HTTP/3),
  `5432/tcp ← 172.16.0.0/12` (docker→PG), VPN `1628/51628/51821`.
- `/etc/stockkeeper/stockkeeper.env` (root, 600): `APP_DOMAIN=157-228-160-86.sslip.io`
  (вариант A; переезд на домен = правка строки + пересоздание контейнеров + новый origin в
  Google Cloud Console), `GOOGLE_CLIENT_ID` = Actions-переменная `VITE_GOOGLE_CLIENT_ID`
  (зашивается в web-образ при сборке — после смены ID нужен rebuild), `SESSION_SECRET`,
  `EXTERNAL_DB_URL=postgresql://stockkeeper:<pw>@host.docker.internal:5432/stockkeeper`
  (пароль и строки подключения в AGENTS не записывать).
- Деплой выполнен 04.10.2026: baseline запушен (`11b7be0`), CI опубликовал образы,
  `dc pull` + `dc up -d` → `stockkeeper-api-1` healthy, `stockkeeper-web-1` up;
  `curl https://157-228-160-86.sslip.io/api/healthz` — 200 (заголовки Caddy/nosniff на месте).
  Осталось: добавить origin `https://157-228-160-86.sslip.io` в Google Cloud Console
  (Authorized JavaScript origins) — без этого Google-вход не работает.
- `deploy/server-setup.sh` — идемпотентный скрипт развёртывания «с нуля» на чистом
  Debian/Ubuntu: чеклист GitHub, apt, PostgreSQL (роль/БД/pg_hba/listen, TCP-проверка),
  ufw (только при systemd), env-файл (промпты с подсказками откуда брать значения,
  автодетект sslip-домена, 600), анонимная проверка GHCR-манифестов, compose
  config/pull/up, ожидание health и проверка строки миграций в логах API.
  Запуск на сервере: `sudo bash deploy/server-setup.sh` (повторный запуск безопасен:
  существующий env-файл не перезапрашивается и не перезаписывается без подтверждения,
  пароль БД берётся из него же). Устойчивость к частичной установке: ретраи
  `apt-get update/install` (лок dpkg), отказ от Docker → мягкий пропуск шагов 5-7
  (`exit 0`), `sshd -T || true`; **`grep -q` в пайпах запрещён** — раннее закрытие
  пайплайна даёт продюсеру EPIPE (255) и `pipefail` валит `if`; проверки вывода —
  через захват в переменную и `case`/сравнение (поймано вживую на Шаге 7).
- `deploy/server-update.sh` — обновление «до последних версий» + чистка хвостов:
  `git pull --ff-only` (блокируется только изменением tracked-файлов; untracked не
  мешает), apt update/upgrade (ретраи, `DPkg::Lock::Timeout`), compose pull/up,
  ожидание health, проверка миграций/healthz, `docker image prune -a`, apt-кэш,
  journal >7 дней; в отчёте — диск до/после и диапазон коммитов. Идемпотентен.
  Оба скрипта проверены вживую на VPS и в контейнере (exit 0, повторные запуски).
  Подробности для оператора — `deploy/RUNBOOK.ru.md`.
- **Деплой 06.10.2026 (фича «Источники»)**: `git pull` на сервере до `705952b`
  (untracked-дубль `deploy/server-update.sh` удалялся перед pull — он мешал
  ff-only), `server-update.sh` → контейнеры пересозданы, API healthy, в БД
  `data_sources` (журнал миграций = 2, всего 13 таблиц в `public`), healthz 200,
  диск разгружен на ~2.2 ГБ. Смоук прода: сид 5 источников, CRUD (201/409/400/204/404),
  поиск отвечает `200 {results, sourceError}` — WB/Ozon режут датацентровые IP
  (`network`/`redirect-loop`, это их антибот, не баг); смоук-аккаунт удалён.
- **Бэкапы БД настроены 06.10.2026**: `/usr/local/sbin/stockkeeper-backup.sh`
  (`pg_dump -Fc` → `/var/backups/stockkeeper/`, владелец `postgres:postgres`,
  проверка `pg_restore -l`, ротация 14 дней, `flock`), cron в `/etc/crontab`
  ежедневно 04:30, лог `/var/log/stockkeeper-backup.log`. Копии только на сервере —
  выгрузку вовне (S3/другой хост) предложить пользователю. Описано в RUNBOOK §5.
- `awg-easy` (форк пользователя `fast-iq/awg-easy`, образ v15.2.0): «unhealthy»
  был транзиентным при старте — сейчас healthy (FailingStreak=0). Панель на
  `51821/tcp` опубликована в интернет по HTTP (`INSECURE=true`, пароль в env не
  задан, авторизация API — 401). **Решение пользователя 06.10.2026: оставить
  как есть** (не ограничивать ufw и не закрывать порт) — не трогать без нового
  указания.
- Google origin `https://157-228-160-86.sslip.io` добавлен в Google Cloud
  Console пользователем 06.10.2026. SMTP отложен решением пользователя
  (`forgot-password` остаётся 503).

### Проверка перед синхронизацией GitHub (03.10.2026)

- Перед отправкой кода проверена актуальная `main` через интеграцию GitHub;
  обычный Git HTTPS в Shell не авторизован. Отправка без force, с сохранением
  текущего удалённого дерева и истории.
- Пользовательские загрузки `attached_assets/`, данные БД и служебные
  метаданные/локальные заметки ассистента не включаются в эту отправку.
- Проверки Replit/Linux: format:check, lint (0 warnings), 26 тестов,
  typecheck и сборка всех пакетов — успешно; `git diff --check` — чисто.
- Актуальный `audit --audit-level=high` обнаружил одну high-уязвимость
  `braces <=3.0.3`, GHSA-vfj7-8cjw-p6xm, в цепочке
  `mockup-sandbox → fast-glob → micromatch → braces`. Отчёт не предлагает
  исправленной версии (`Patched versions: <0.0.0`). Уязвимость не устранена;
  CI security-audit может падать. Не отключать проверку и не выдавать
  этот результат за чистый аудит.

### CSRF: cookie сессии

- В `artifacts/api-server/src/app.ts` установлен явный `sameSite: "lax"` для production
  и development. Это предотвращает передачу cookie при cross-site POST, включая создание
  categories/locations/units/shopping-list и logout, без изменения обработчиков.
- Secure в production, HttpOnly и срок 7 дней сохранены. Same-origin запросы остаются
  аутентифицированными; cross-site iframe может не получать cookie — не ослаблять
  production-политику ради iframe.
- `tests/session-cookie.test.mjs` проверяет реальную конфигурацию и Set-Cookie в обоих
  режимах на изолированном Express-сервере; включён в `corepack pnpm test`.
- Проверено в Replit/Linux: format:check, lint (0 warnings), test (9/9), build
  (включает typecheck), audit --audit-level=high — успешно; API healthz — 200.

### 3.1 Зависимости (audit: 12 → 0)

| Проблема (advisory)                                                                                                                                         | Фикс                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| nodemailer 9.1.1 — 5 уязвимостей (GHSA-v53p-9fqp-m79j, GHSA-prgh-xp8r-p3m5, GHSA-6vj9-mwq6-2f5v, GHSA-8vvx-rff5-p5rq, GHSA-g57g-f23g-4646; patched ≥10.0.9) | `artifacts/api-server/package.json`: `"nodemailer": "^10.0.13"`; удалён `@types/nodemailer` (v10 имеет свои types: `dist/cjs/nodemailer.d.ts`). API совместим (`createTransport`/`sendMail` в `services/email.ts`) |
| fast-uri 4.1.3 (GHSA-58mr…, GHSA-qw65…, GHSA-hrr3…, GHSA-jvvf…) через `ajv` в `lib/api-spec`                                                                | `pnpm-workspace.yaml`: **одно** правило `fast-uri@>=3.0.0 <4.1.5: '>=4.1.5'` (заменило 5 старых правил 3.x) → в lockfile теперь 4.2.1                                                                              |
| brace-expansion 5.0.x (GHSA-6j4f…, GHSA-qhr7…, GHSA-q2hr…) через `minimatch`/`typedoc`                                                                      | `brace-expansion@>=4.0.0 <5.0.12: '>=5.0.12'`                                                                                                                                                                      |
| nodemailer-override со старым диапазоном                                                                                                                    | `nodemailer@<9.1.1` → `nodemailer@<10.0.9: '>=10.0.9'`                                                                                                                                                             |

**Урок по overrides pnpm:**

- правило-ключ матчится по **запрашиваемому/текущему диапазону родителя**; старые правила по тому же пакету могут «перехватить» матч и оставить уязвимую версию → при обновлении уязвимого пакета **заменять старые правила, а не добавлять рядом**;
- `ajv` просит `fast-uri: ^3.0.1`, а фактически стояла 4.1.3 (наследие override `>=3.1.4`) — поэтому ключ правила был расширен до `>=3.0.0`.

**06.10.2026 — 4 новых advisory** (registry обновился; фикс — overrides в `pnpm-workspace.yaml`,
`pnpm install` зелёный, `pnpm audit` показывает только braces):

| Advisory                                                 | Severity | Правило                                                                                         |
| -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| proxy-addr GHSA-jqcg-44mw-7w3h (express)                 | critical | `proxy-addr@>=1.1.0 <2.0.8: ">=2.0.8"`                                                          |
| source-map-js GHSA-68fv-2mgg-jv7q (tailwindcss)          | high     | `source-map-js@>=1.0.0 <1.2.2: ">=1.2.2"`                                                       |
| fast-copy GHSA-jggr-w7fw-pc2j (pino-pretty)              | moderate | `fast-copy@>=4.0.0 <4.1.0: ">=4.1.0"`                                                           |
| postcss-selector-parser GHSA-rj75-hqrm-r3gf (typography) | moderate | `postcss-selector-parser@<7.1.6: ">=7.1.6"` (major 6→7; проверено полной сборкой inventory-app) |

**07.10.2026 — устранён `braces <=3.0.3` (GHSA-vfj7-8cjw-p6xm, CVE-2026-93687)**: у advisory
`Patched versions: None` (проверено по GitHub Advisory и npm 07.10; последняя версия на npm —
3.0.3 от 21.05.2024) → **override невозможен**. Цепочка
`mockup-sandbox → fast-glob → micromatch → braces` устранена заменой единственного прямого
потребителя: `fast-glob` → `tinyglobby@^0.2.17` (`artifacts/mockup-sandbox/package.json`),
зависимости `fdir`/`picomatch` — без braces; версия от 30.05.2026 проходит
`minimumReleaseAge`. В `mockupPreviewPlugin.ts` — `import { glob } from "tinyglobby"`,
тот же вызов `glob(pattern, { cwd, ignore })`; поведение проверено на Windows (build с
тестовым mockup-файлом даёт корректные posix-ключи и импорты в
`src/.generated/mockup-components.ts`, пустой каталог — пустая карта, как и fast-glob).
`micromatch` из lockfile ушёл полностью; `pnpm audit --audit-level=high` →
**No known vulnerabilities found (exit 0)** — CI `security-audit` зелёный.
`fast-glob` возвращать не нужно; если появится новый advisory — фикс через replacement/override
здесь же.

### 3.2 Код API (`artifacts/api-server/src/…`)

| Проблема                                                                                                                                   | Фикс                                                                                                                                                                      | Файл(ы)                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| IDOR: PATCH/DELETE locations и DELETE units выполнялись без фильтра владельца, «404» возвращался уже после изменения/удаления чужой строки | `AND userId` прямо в `WHERE`, проверка `!row`                                                                                                                             | `routes/locations.ts`, `routes/units.ts`      |
| CORS `origin: true` — рефлексия любого origin вместе с креденшелами                                                                        | allowlist: localhost/127.0.0.1 (любой порт), домены из `REPLIT_DOMAINS` + `CORS_ORIGINS`, домены `*.replit.dev`/`*.replit.app`/`*.repl.co` только вне production          | `app.ts`                                      |
| Нет JSON-ответов на 404/ошибки, нет nosniff                                                                                                | 404-хендлер `/api`, error-middleware (400 для `entity.parse.failed`/413, 500 без утечки деталей), заголовок `nosniff`                                                     | `app.ts`                                      |
| Session fixation                                                                                                                           | `await regenerateSession(req)` перед `req.session.userId = …`                                                                                                             | `routes/auth.ts`                              |
| Чужие ссылки в предметах (утечка имён через join, мусор в данных)                                                                          | `validateItemRefs()` (category/unit/location) до INSERT/UPDATE; owner-фильтры в `leftJoin` и выборке `categoryName`                                                       | `routes/items.ts`                             |
| Цикл в категориях → бесконечный `while` в `getAllDescendantIds`; чужой/свой parent                                                         | visited-Set + `childrenOf` map; `validateParentId()` (существование, не self, не потомок, нет цикла)                                                                      | `routes/items.ts`, `routes/categories.ts`     |
| `itemId` в shopping-list без проверки владельца                                                                                            | проверка `items.userId` до INSERT                                                                                                                                         | `routes/shopping-list.ts`                     |
| Нет rate limit на auth-эндпоинты                                                                                                           | новый `middlewares/rate-limit.ts` (in-memory, окно + `Retry-After`); лимиты: register/login/google 10/15 мин, forgot 10/15 мин по IP и 5/15 мин по email, reset 10/15 мин | `routes/auth.ts`, `middlewares/rate-limit.ts` |
| Каждый forgot-password оставлял старые токены действительными                                                                              | перед INSERT — `usedAt` всем неиспользованным токенам пользователя                                                                                                        | `routes/auth.ts`                              |
| `PATCH /auth/me` не принимал `language: "auto"` (схема default = `auto`)                                                                   | добавлено `"auto"` в список                                                                                                                                               | `routes/auth.ts`                              |
| Гонка регистрации → 500 вместо 409                                                                                                         | `try/catch` + `isUniqueViolation` (`code === '23505'`) → 409                                                                                                              | `routes/auth.ts`                              |

### 3.3 Прочее (включая CI-подготовку)

| Проблема                                                                                              | Фикс                                                                                                                                                 | Файл(ы)                                                        |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `drizzle-kit push` на Windows падал: «No schema files found» (glob ломается на `\`)                   | путь через `path.sep` → `/`: `path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/")`                                               | `lib/db/drizzle.config.ts`                                     |
| session-таблица создавалась только ручным DDL — в свежей БД (CI/прод) её нет                          | добавлена `sessionTable` в drizzle-схему, экспорт из index; теперь `push` создаёт её автоматически                                                   | `lib/db/src/schema/session.ts` (новый)                         |
| `pnpm build` невозможен на Windows: platform-исключения в overrides отсеивали все win32-x64 бинарники | удалены 4 строки overrides (`rollup`/`esbuild`/`lightningcss`/`tailwind-oxide` для win32-x64); lockfile обновлён (`pnpm install`), frozen проходит   | `pnpm-workspace.yaml`                                          |
| vite-конфиги падали без env `PORT`/`BASE_PATH` (Replit-наследие) → сборка невозможна в CI/локально    | дефолты: `PORT ?? "3000"`, `BASE_PATH ?? "/"`; валидация числа сохранена                                                                             | `artifacts/*/vite.config.ts` (2 файла)                         |
| Чистота кода: ESLint отсутствовал, репо не было отформатировано                                       | flat-config `eslint.config.mjs` (typescript-eslint recommended + eslint-plugin-security + prettier-disable); полный `prettier --write` (~210 файлов) | `eslint.config.mjs`, `.prettierignore` (новые), `package.json` |

### 3.4 CI/CD (GitHub Actions, схема из awg-easy, адаптированная под StockKeeper)

| Workflow                                  | Что дело/ловит                                                                                                                               | Примечание                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                | на каждый push/PR: `lint` / `typecheck` / `format:check` (matrix), `test` (7/7), `build`, `security-audit` (`pnpm audit --audit-level=high`) | audit-level=high: в awg-easy стоял critical — здесь строже                                                                |
| `.github/workflows/codeql.yml`            | SAST CodeQL (javascript-typescript), push/PR/main + nightly cron                                                                             | guard: только публичное репо (нужен GHAS)                                                                                 |
| `.github/workflows/dependency-review.yml` | на PR: `actions/dependency-review-action@v4`, `fail-on-severity: high`                                                                       | guard: только публичное репо (нужен GHAS)                                                                                 |
| `.github/workflows/secret-scanning.yml`   | gitleaks (вся история, `fetch-depth: 0`)                                                                                                     | free для user-аккаунта (fast-iq = User, не Org)                                                                           |
| `.github/workflows/zap.yml`               | DAST: Postgres-service → `drizzle-kit push` → сборка → сервер на :8080 → `zaproxy/action-baseline@v0.15.0` (baseline, alpha-правила `-a`)    | расписание: пн 03:30 UTC + `workflow_dispatch`; отчёт в артефакте `zap-baseline`; `fail_action` по умолчанию не валит job |
| `.github/dependabot.yml`                  | weekly: npm (root) + github-actions, сгруппированные PR                                                                                      | version-updates; security-alerts для приватного репо требуют GHAS                                                         |

Скрипты в root `package.json`: `lint` (`eslint . --max-warnings=0`), `test`, `format`, `format:check`, `packageManager: pnpm@10.34.6`.

**Анти-ворнинги CI:** все job'ы используют `runs-on: ubuntu-24.04` (пин от миграции
`ubuntu-latest` → Ubuntu 26, 19.10.2026 — не возвращать `ubuntu-latest` без причины);
`gitleaks/gitleaks-action@v3` (v2 использует deprecated Node 20 — после 16.09.2026 вообще не запустится).

### 3.5 Чистка lint-предупреждений (32 → 0) и спека User

| Проблема                                                                                                                                        | Фикс                                                                                                                                                                                                                                                                                                                                                                                  | Файл(ы)                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| В openapi не описаны поля, которые реально возвращает `serializeUser` (`language`, `isAdmin`) → фронт кастовал через `as any`                   | в `User` добавлены `language` (enum `auto/ru/en`, все пути записи валидируют) и `isAdmin` в properties+required → `pnpm --filter @workspace/api-spec codegen` → union `UserLanguage`                                                                                                                                                                                                  | `lib/api-spec/openapi.yaml`, сгенерированные `lib/api-client-react/src/generated/api.schemas.ts`, `lib/api-zod/src/generated/**`                                      |
| 24 × `no-explicit-any`                                                                                                                          | `requireAdmin(req/res/next: express-типы)`; cast'ы `user`/`me`/`data` убраны (типы появились); `catch (e: any)` → `catch (e)` + `e instanceof Error ? e.message : String(e)`; `onError (err: any)` → просто `err` (тип `ApiError<ErrorResponse>`); `StatCard(...: any)` → `StatCardProps` с `LucideIcon`; debounce-хак `(fn as any)._timer` → `useRef<ReturnType<typeof setTimeout>>` | `routes/admin.ts`, `Sidebar.tsx`, `admin.tsx`, `dashboard.tsx`, `inventory.tsx`, `item-detail.tsx`, `item-new.tsx`, `login.tsx`, `reset-password.tsx`, `settings.tsx` |
| `onError` читал `err?.response?.data?.error` (axios-стиль) — у `ApiError` это всегда `undefined`, серверные сообщения об ошибке не показывались | `err.data?.error` (свойство `ApiError.data` = разобранный JSON-тело)                                                                                                                                                                                                                                                                                                                  | `login.tsx`, `settings.tsx`, `reset-password.tsx`                                                                                                                     |
| timing-attack на `password !== confirm` (ложное: клиентская проверка формы)                                                                     | точечный `eslint-disable-next-line` с причиной                                                                                                                                                                                                                                                                                                                                        | `reset-password.tsx`                                                                                                                                                  |
| 7 × `security/detect-non-literal-fs-filename` в build-тулчейне (codegen postprocess, vite-плагин mockup)                                        | override правила «off» только для `**/*.mjs`, `mockupPreviewPlugin.ts`, `scripts/**`                                                                                                                                                                                                                                                                                                  | `eslint.config.mjs`                                                                                                                                                   |
| warnings вообще не должны накапливаться                                                                                                         | `lint` → `eslint . --max-warnings=0` (падение CI при первом же warning)                                                                                                                                                                                                                                                                                                               | `package.json`                                                                                                                                                        |

**Про codegen:** после `pnpm --filter @workspace/api-spec codegen` запускать полный скрипт
(он включает `postprocess-generated.mjs` — он нормализует `lib/api-zod/src/index.ts` до одного
`export * from "./generated/api"`; голый `orval` без постпроцесса оставит двойной barrel → TS2308).
Сгенерированные файлы в `.prettierignore` — format:check их не трогает.

### 3.6 ZAP: первый прогон, разбор отчётов, `.zap/rules.tsv`

Первый прогон (02.10.2026): **High 0 / Medium 1 / Low 2 / Info 5**, 4 эндпоинта (100% 4xx — без аутентификации).
Секретов/куков в отчётах нет (3 «попадания» в sarif — описания правил каталога, не значения).

| pluginid | Алерт                                            | Решение                                                                                           |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 10037    | `X-Powered-By: Express` (Low)                    | `app.disable("x-powered-by")` — см. инвариант 16                                                  |
| 10063    | Permissions-Policy not set (Low)                 | глобальный заголовок — инвариант 16                                                               |
| 10049    | Storable and Cacheable (Info)                    | `Cache-Control: no-store` глобально — инвариант 16                                                |
| 10055    | CSP без `frame-ancestors`/`form-action` (Medium) | источник — HTML404 finalhandler express; заменён своим text/plain-404 с полным CSP — инвариант 16 |
| 90005    | Sec-Fetch-\* missing (Info, 4 алерта)            | IGNORE в `.zap/rules.tsv` (заголовки шлёт браузер, не сканер)                                     |

Формат `.zap/rules.tsv` (как в README action-baseline): `ID<TAB>IGNORE<TAB>(название)` — **табы, не пробелы**;
подключён в `zap.yml` через `rules_file_name: ".zap/rules.tsv"`.

**Второй прогон (после фиксов, 02.10.2026): High 0 / Medium 0 / Low 0 / Info 5.** Из них:

- **4 × Sec-Fetch-\* (90005)** — alpha-правило `FetchMetadataRequestHeadersScanRule`
  (`pscanrulesAlpha`, подтверждено `PLUGIN_ID = 90005`); в скан попадало **только из-за
  `cmd_options: "-a"`** → `-a` удалён из `zap.yml` (больше alpha ничего не давало;
  шумные Base64Disclosure/FullPathDisclosure больше не участвуют).
- **1 × Non-Storable Content (10049)** — beta `CacheableScanRule` (ставится всегда); сработал
  **из-за нашего `Cache-Control: no-store`** — ZAP предлагает кэшировать. Не дыра; штатными
  средствами baseline не убирается (AF-job `get_af_pscan_config` принимает только
  `enableTags`/`maxAlertsPerRule`; `rules.tsv` при `allow_issue_writing: false` артефакт не
  фильтрует) → отключено на уровне ZAP, см. «Третий/четвёртый прогон» ниже.

**Ограничение `rules.tsv` (upstream, проверено по исходникам):** в `@zaproxy/actions-common-scans`
при `allow_issue_writing: false` `processReport` делает ранний `return` сразу после `uploadArtifacts`
и **не доходит до `filterReport`** → в артефакт попадают сырые отчёты; `rules.tsv` влияет только на
exit code. С `true` фильтруется лишь `report_json.json` (md/html не трогаются), при чистом отчёте
артефакт вообще не загружается (return до upload), нужны `issues: write` и создаются issues —
поэтому `allow_issue_writing: false` оставлен осознанно, не «чинить» включениеем issue-writing.

**Третий прогон (после удаления `-a`, 02.10.2026): High 0 / Medium 0 / Low 0 / Info 1** —
остался только 10049.

**Фикс 10049** — `cmd_options` в `zap.yml`:

`'-z "-config pscans.pscanner(0).id=10049 -config pscans.pscanner(0).enabled=false"'`

Цепочка (проверено по исходникам): `cmd_options` → аргументы `zap-baseline.py` (action `index.js`)
→ `-z` → `shlex.split` → `-config` в argv ZAP → `Model.init(overrides)` → `AbstractParam.load`
применяет overrides к `config.xml` **до** `parse()` → при загрузке правила `ExtensionPassiveScan2.add()`
вызывает `pps.setConfig(getModel().getOptionsParam().getConfig())` → `loadFrom` читает
`configurationsAt("pscans.pscanner")`. Оба ключа обязательны: без `id=10049` запись не
сопоставится с правилом (`isPluginConfiguration` сверяет `id`/`classname`). В дефолтном `config.xml`
записей `pscanner` нет → индекс `(0)` безопасен; AF-job `passiveScan-config` состояние правил не
перетирает (трогает только autoTagScanners через `enableTags`).

**Четвёртый прогон (после фикса, 02.10.2026, run 37046631099 @ `b7f5cc7`): High 0 / Medium 0 /
Low 0 / Informational 0**, `alerts: []` — отчёт полностью чистый (Insights-статистика внизу отчёта —
не алерты).

### 3.7 Внешний PostgreSQL в Replit (02.10.2026)

- Перед правками импортирован архив актуальной ветки GitHub `main`: все 267 файлов
  проверены по Git blob SHA и совпали с ранее полученным деревом GitHub.
  Пользовательские загрузки и локальная настройка окружения `.replit` сохранены.
- `lib/db/src/index.ts` и `lib/db/drizzle.config.ts`: приоритет `EXTERNAL_DB_URL`,
  затем `DATABASE_URL`. Один и тот же URL используется приложением, сессиями (общий pool)
  и drizzle-kit. Секреты не изменяются и не выводятся.
- Для Production достаточно задать `EXTERNAL_DB_URL` только в Production Secrets;
  Development без этого секрета продолжит использовать управляемую БД Replit.
- Автоматического переноса данных и изменения схемы внешней БД нет.
  `push` меняет схему выбранной БД: запускать отдельно и осознанно, без `push-force`
  для Production.
- Проверки выбора URL: внешняя строка при наличии обеих переменных; только внешняя;
  только управляемая; отсутствие обеих; пустая внешняя строка.
  Все пять сценариев проверены для runtime pool и drizzle-kit на синтетических URL,
  без подключения к реальным БД.
- `eslint.config.mjs`: из lint исключены только служебные каталоги Replit `.local/**`
  (шаблоны инструментов ассистента) и `.cache/**` (кэш Corepack).
  Иначе `eslint .` проверяет чужие служебные файлы, которых нет в GitHub/CI;
  правила для исходников приложения не изменены.
- Сервисы в трёх `artifacts/*/.replit-artifact/artifact.toml` и postBuild в `.replit`
  запускают pnpm через Corepack. `.npmrc` отключает рекурсивный менеджер версий pnpm.
  `packageManager` и lockfile сохранены без изменения версий зависимостей.
- Результаты проверки в Replit: форматирование и lint — без ошибок/предупреждений;
  тесты Google Auth — 7/7; typecheck и сборка всех пакетов — успешно;
  audit — известных уязвимостей нет. Проверки URL описаны выше.
- Проверка Development обнаружила отсутствие `session`. После подтверждения выбора
  управляемого `DATABASE_URL` выполнен `push --verbose` без `--force`:
  только `CREATE TABLE session` и `CREATE INDEX session_expire_idx`, без изменений
  остальных таблиц. Проверены сохранение, чтение и удаление временной тестовой сессии.
  Production и внешняя БД не изменялись.
- Все три сервиса запущены; `/api/healthz` — 200, `/api/auth/me` без сессии — 401,
  страница входа отображается. Соединение с управляемой Development-БД проверено.
  Подключение к внешней Production-БД необходимо подтвердить после публикации.

### 3.8 Обмен данными и цена товара

- Настройки аккаунта: экспорт товаров и покупок в XLSX, полная копия данных
  аккаунта в JSON; импорт обоих форматов с предпросмотром и подтверждением.
  Аккаунты, пароли, reset-токены и сессии не экспортируются. Фото — только ссылки.
- API: `GET /api/data/export?format=json|xlsx`, `POST /api/data/preview`,
  `POST /api/data/import`. Только текущий пользователь; исходные ID в копии
  переназначаются через локальные карты, чужие ID не используются для записи.
  Применение — одна транзакция с блокировкой параллельных импортов аккаунта.
  Никогда не удаляет/обновляет существующие записи. Режим `skip` сохраняет
  старые количества/цены; `add` добавляет даже совпадающие товары и покупки.
- При поиске совпадений теги сравниваются как набор с обрезанными пробелами,
  без учёта порядка. Редактор тегов меняет формат запятых: строковое сравнение
  приводит к дубликатам после обычного редактирования цены. Описание в форме —
  многострочное, чтобы редактирование не теряло переносы строк исходного файла.
- Excel «Метрика»: лист «Купить» → покупки; остальные листы → категории.
  «Кол-во дома»/«Кол-во гараж» → отдельные записи в местах «Дом»/«Гараж».
  Материал и стандарт → теги, длина → описание, цена → `items.price`.
  Неоднозначные остатки (например «много > 60») требуют исправления исходного
  файла: не угадывать и не пропускать такие строки.
- Ограничения: файл ≤5 МиБ, распакованный XLSX ≤40 МиБ, ≤10 000 строк Excel,
  ≤15 000 записей JSON, глубина категорий ≤64. Формулы не выполняются;
  входящие формулы отвергаются. Проверяются реальные размеры распаковки ZIP,
  даты, числовые диапазоны, ссылки и циклы.
- Цена — nullable `numeric(14,2)`, неотрицательная, за единицу; валюта не задана.
  Создание, редактирование, копирование и отображение товара используют это поле.
- Миграция `0000_shop_price_history` идемпотентно добавляет `items.price` и таблицы
  `shops`, `item_prices`, `price_settings`; она сохраняет существующие таблицы и записи.
  Production API применяет новые миграции при запуске только к `EXTERNAL_DB_URL`;
  Publishing должен предоставлять этот секрет. Development migration runner использует
  только `DATABASE_URL`. Не подключаться к внешней Production-БД для ручного изменения схемы.

- `pnpm run test` теперь включает Google auth и `test:data-transfer`.
  Загруженный пользовательский Excel не коммитить; тест его чтения пропускается
  в CI при отсутствии файла, синтетические XLSX-тесты работают всегда.
- ExcelJS использует только поддерживаемые импорты XLSX. Для его зависимости
  UUID закреплена совместимая CJS-версия 11.1.1, исправляющая GHSA-w5hq-g745-h8pq.
- Выгрузка XLSX содержит скрытые ID/ссылки, названия единиц и старые текстовые
  поля места/единицы. Не удалять служебные столбцы при обратной загрузке:
  они сохраняют связи покупок и позволяют пропускать совпадающие записи.
  Пустая единица покупки сохраняется как `null`, а не заменяется «шт».
  Единицы JSON сопоставляются по названию и символу, не только по символу:
  иначе собственная единица с тем же символом теряет имя при восстановлении.

## 4. Итоги верификации (02.10.2026)

Сессия 1 (безопасность кода и зависимости):

- `pnpm audit` → **No known vulnerabilities found** (было 12: 6 high / 6 moderate).
- `pnpm run typecheck` → 0 ошибок; `test:google-auth` → 7/7; build api-server → OK.
- Smoke (БД не нужна): 10/10 — healthz, nosniff, JSON 404, CORS reject/allow, invalid JSON → 400, rate limit 429 на 11-й попытке.
- E2E на PostgreSQL 18.4: **43/43** — IDOR (locations/units/глобальный unit), чужие ссылки (400), циклы (400), сброс пароля (инвалидация/повтор/старый пароль), регенерация сессии, 409 дубликата, `language: auto`.

Сессия 2 (CI/CD):

- `pnpm run lint` → 0 ошибок, 32 warnings (7 ошибок было исправлено в коде: unused imports/vars, `no-undef` в `.mjs`).
- `pnpm run format:check` → OK (полный реформат репо prettier, ~210 файлов).
- `pnpm run typecheck`, `pnpm run test` (7/7), `pnpm run build` (все пакеты, включая vite) → OK.
- `pnpm install --frozen-lockfile` → OK (воспроизводимо, как в CI); `pnpm audit --audit-level=high` → 0.

Сессия 3 (анти-ворнинги CI + чистка lint до нуля):

- `pnpm run lint` (`--max-warnings=0`) → **0 ошибок, 0 warnings** (было 32 warnings).
- `pnpm run format:check`, `pnpm run test` (7/7), `pnpm run build` (включая typecheck) → OK после codegen.
- codegen (`orval` + postprocess) → exit 0; диф генерации только User-поля (+ `userLanguage.ts`).
- В workflows заменено 7 × `runs-on: ubuntu-latest` → `ubuntu-24.04`, `gitleaks-action@v2` → `@v3`.

Сессия 4 (ZAP: отчёты, заголовки, rules.tsv):

- Первый ручной ZAP-прогон успешен: High 0 / Medium 1 / Low 2 / Info 5; отчёты проверены на секреты — чисто.
- Заголовки доведены до чистоты (см. инвариант 16): smoke на собранном `dist/index.mjs` подтвердил —
  на `/` и `/api/healthz` нет `X-Powered-By`, есть `no-store` + `Permissions-Policy`, 404 отдаёт полный CSP.
- `format:check` снова зелёный после добавления отчётов в ignore (до этого падал exit 2 на отчётном html).
- Полная проверка: lint 0/0, format ✓, typecheck ✓, test 7/7, build ✓.

## 5. Изменённые файлы (по сессиям)

```
CI/CD (новые):
A .github/workflows/ci.yml               # lint/typecheck/format matrix + test + build + audit(high)
A .github/workflows/codeql.yml           # SAST (guard: только public)
A .github/workflows/dependency-review.yml# PR dependency review (guard: только public)
A .github/workflows/secret-scanning.yml  # gitleaks
A .github/workflows/zap.yml              # OWASP ZAP baseline (weekly + dispatch)
A .github/dependabot.yml                 # npm + github-actions, weekly
A eslint.config.mjs                      # flat config: ts-eslint + security plugin + prettier
A .prettierignore                        # node_modules/dist/generated/.agents/lockfile

Правки кода сессии 1:
M artifacts/api-server/package.json          # nodemailer ^10.0.13, -@types/nodemailer
M artifacts/api-server/src/app.ts            # CORS allowlist, nosniff, 404, error-middleware
M artifacts/api-server/src/routes/auth.ts    # rate limit, regenerate, 23505→409, auto, токены
M artifacts/api-server/src/routes/categories.ts  # validateParentId (циклы/чужие)
M artifacts/api-server/src/routes/items.ts   # validateItemRefs, visited-set, owner-join'ы
M artifacts/api-server/src/routes/locations.ts   # IDOR WHERE userId
M artifacts/api-server/src/routes/shopping-list.ts # itemId owner check
M artifacts/api-server/src/routes/units.ts   # IDOR WHERE userId (в т.ч. запрет удаления глобальных)
M artifacts/api-server/src/middlewares/rate-limit.ts (новый)

Правки сессии 2 (помимо CI):
M package.json                             # scripts lint/test/format/format:check + packageManager
M pnpm-workspace.yaml / pnpm-lock.yaml     # +eslint-депсы, -4 win32-x64 platform-override
M lib/db/src/schema/session.ts (новый) + index.ts  # session в drizzle-схеме
M artifacts/inventory-app/vite.config.ts   # PORT/BASE_PATH defaults
M artifacts/mockup-sandbox/vite.config.ts  # PORT/BASE_PATH defaults
M artifacts/api-server/src/routes/admin.ts # -unused sql import (eslint error)
M artifacts/inventory-app/src/components/ProtectedRoute.tsx  # -unused location (eslint)
M artifacts/inventory-app/src/hooks/use-toast.ts            # actionTypes: const → type (eslint)
M artifacts/mockup-sandbox/src/hooks/use-toast.ts           # то же
+ ~210 файлов переформатировано prettier (полный реформат, включая *.md и json)
```

Правки сессии 3 (ворнинги CI/lint + спека User; запушены в `9b195f1`):
M .github/workflows/_.yml (5 шт.) # ubuntu-24.04 пин, gitleaks-action@v3
M lib/api-spec/openapi.yaml # User: +language (enum auto/ru/en), +isAdmin
M lib/api-client-react/src/generated/api.schemas.ts # UserLanguage, поля User (+codegen)
M lib/api-zod/src/generated/{api.ts, types/_} # то же на zod/типы (+types/userLanguage.ts новый)
M artifacts/api-server/src/routes/admin.ts # requireAdmin: any → express Request/Response/NextFunction
M artifacts/inventory-app/src/… (9 файлов) # -24 any: типы User, catch unknown, StatCardProps, # useRef вместо \_timer-хака, onError → err.data?.error
M eslint.config.mjs # fs-heuristics off для build-тулчейна
M package.json # lint: --max-warnings=0
M AGENTS.md # §1/§2.13/§3.5/§4/§5

Правки сессии 4 (ZAP: отчёты/заголовки/rules; запушены в `bc60960` вместе с переименованием AGETS→AGENTS):
M artifacts/api-server/src/app.ts # x-powered-by off, no-store+Permissions-Policy, свой404 с CSP
M .github/workflows/zap.yml # + rules*file_name: .zap/rules.tsv
M .gitignore / .prettierignore # + 4 файла отчётов ZAP
A .zap/rules.tsv (новый) # 90005 IGNORE (Sec-Fetch-\*)
M AGENTS.md # инварианты 16-17, §3.6, §4, §5
(отчёты results.sarif/report*\* остались untracked и намеренно не коммичатся)

Правки сессии 5 (ZAP: убран `-a`; запушены в `35b3739`):
M .github/workflows/zap.yml # - cmd_options: "-a" (источник 4× Info 90005)
M AGENTS.md # §3.6: второй прогон 0/0/0 + ограничение rules.tsv; §5/§6

Правки сессии 6 (ZAP: отключение 10049 → чистый отчёт; zap.yml запушен в `b7f5cc7`):
M .github/workflows/zap.yml # + cmd_options: '-z "-config pscans.pscanner(0)..."'
M AGENTS.md # §3.6: 3-й/4-й прогон и механика -config; §5/§6

Правки сессии 7 (полная схема на пустой БД + развёртывание VPS + скрипт деплоя;
коммит — после подтверждения пользователя):
M lib/db/migrations/0000_shop_price_history.sql # +полный idempotent baseline (11 таблиц)
M artifacts/api-server/tests/migrations.integration.test.mjs # +сценарий пустой БД
A deploy/server-setup.sh # идемпотентный скрипт развёртывания с нуля (RU-промпты)
A deploy/server-update.sh # обновление до последних версий + очистка (образы/apt/journal)
M deploy/docker/README.md # публичные пакеты вместо «private + docker login», раздел про скрипт
A deploy/RUNBOOK.ru.md # полная инструкция для оператора (RU)
M AGENTS.md # §2.22, §3 (baseline + VPS + скрипт), §5, §6 (Docker/GHAS)

Правки сессии 8 (фича «Источники сбора данных» + audit-overrides; коммит — после
подтверждения пользователя):
A lib/db/src/schema/data-sources.ts # таблица data*sources (unique userId+name)
A lib/db/migrations/0001_data_sources.sql # +meta/0001_snapshot.json, journal 0001 (без public.)
M lib/db/src/schema/index.ts # export * from "./data-sources"
M lib/api-spec/openapi.yaml # пути /data-sources{,/search,/{id}} + схемы (+codegen)
M lib/api-client-react/src/generated/api{.ts,.schemas.ts} # хуки use{List,Create,Delete}DataSources, useSearchDataSources
M lib/api-zod/src/generated/\_ # zod-схемы + types/{createDataSourceBody,dataSource,searchDataSourceBody,sourceSearchResult{,Item}}.ts (новые)
A artifacts/api-server/src/services/source-search.ts # SSRF-гард + шаблоны + fetch + экстрактор
A artifacts/api-server/src/routes/data-sources.ts # CRUD + search-прокси (rate-limit 30/мин)
M artifacts/api-server/src/routes/index.ts # + dataSourcesRouter
A artifacts/api-server/tests/source-search.test.mjs # 18 юнит-тестов (injectable fetch/DNS)
M artifacts/api-server/package.json # + test:sources
M package.json # test-цепочка + test:sources
M artifacts/api-server/tests/migrations.integration.test.mjs # 12/16/4/journal=2 + data_sources в легаси
A artifacts/inventory-app/src/components/SourceSearch.tsx # секция в item-detail
M artifacts/inventory-app/src/pages/item-detail.tsx # монтаж <SourceSearch/>
M artifacts/inventory-app/src/i18n/locales/{ru,en}.json # ключи sources.\*
M pnpm-workspace.yaml / pnpm-lock.yaml # +4 overrides (proxy-addr, source-map-js, fast-copy, postcss-selector-parser)
M AGENTS.md # инвариант 23, §3 (фича), §3.1 (audit 06.10), §5, §6 (WSL/Docker)

## 6. Окружение и известные ограничения

- **Docker**: раньше был невозможен локально (без WSL, e2e шёл через `embedded-postgres`);
  затем на рабочей машине работал Docker Desktop. **06.10.2026: WSL не установлен
  (`wsl -l -v` → «Подсистема… не установлена»), Docker Desktop не стартует** — временные
  PostgreSQL-контейнеры локально не поднять. Установка WSL требует `wsl --install` + перезагрузки
  (не выполнять без пользователя). Интеграционные тесты (`test:integration`) гонять в CI
  (job Backup restore с PostgreSQL service) или после восстановления Docker.
  До 06.10.2026 на нём поднимались `postgres:17-alpine` для интеграционных тестов и сборка образов.
- Временные креды тестовой БД: `postgresql://postgres:pw-test-123@127.0.0.1:5433/stockkeeper` (только для тестов, не для прода).
- `forgot-password` без настроенного SMTP/Resend отвечает **503** — это ожидаемо (токен при этом уже создаётся в БД).
- Пароль от реального сервера БД `83.147.243.54` и `DATABASE_URL` пользователь вводит сам как секрет в Replit.
- `websearch` (exa) даёт 403 — для advisory использовать `webfetch` на `github.com/advisories`.
- **GHAS**: репозиторий `fast-iq/StockKeeper` **публичный** (с04.10.2026) → CodeQL и Dependency Review
  работают, их guard `private == false` снят ими же и не мешает; если репозиторий снова станет
  приватным без GHAS — вернуть guard в `codeql.yml`/`dependency-review.yml` (в awg-easy он есть).
- **ZAP-скан**: прогон 1 — High 0 / Medium 1 / Low 2 / Info 5 (фикс: §3.6); прогон 2 после фиксов —
  **High 0 / Medium 0 / Low 0 / Info 5**, из них 4 × Sec-Fetch убраны удалением `cmd_options: "-a"`
  (alpha-правило 90005), остаётся 1 × 10049 ( следствие нашего `no-store`, безвредно).
  Прогон 3 (без `-a`) — 0/0/0 + Info 1; **прогон 4 (с `-config` отключением 10049, `b7f5cc7`) —
  High 0 / Medium 0 / Low 0 / Informational 0, `alerts: []`** (механика: §3.6).
  `rules_file_name: ".zap/rules.tsv"` подключён, но из-за upstream-ограничения
  (`allow_issue_writing: false` → нет `filterReport`) влияет только на exit code — см. §3.6;
  `fail_action` не включать (иначе job упадёт на любом info-алерте), `-I` в `cmd_options` не нужен.
  Отчётный `results.sarif` приходит пустым (`results: []`) — алерты брать из `report_md.md`/`report_json.json`.
- **Gitleaks**: v2 бесплатен для user-аккаунтов; `fast-iq` — User (не Org), лицензия не нужна.
- **`artifacts/mockup-sandbox/src/.generated/mockup-components.ts`** — tracked-файл, который
  перегенерируется при каждом `vite build` mockup-sandbox (и становится «грязным» в git status).
  Исключён из prettier (`.prettierignore`); при чистке diff'а — `git restore`, не коммитить локальную
  перегенерацию без причины.
- **APK (Фаза 2, §3)**: берётся из Actions → workflow «Android APK» → artifact
  `stockkeeper-debug-apk` (не из релизов; релизы настраиваются позже). Подпись debug-стабильная
  (`stockkeeper-debug.p12` в репо) — обновления ставятся поверх без удаления. WebView APK не
  умеет камеру (`getUserMedia`) — сканер штрихкодов доступен только в PWA под Chrome; Google-вход
  в WebView непроверен (парольный — проверен). Gradle/Java локально нет — сборка только в CI;
  `cap sync` локально возможен.
