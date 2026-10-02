# AGENTS.md — памятка ассистента (изменения, инварианты, проверки)

> **Правило работы:** перед любой задачей читать раздел «Инварианты» и «Изменения»;
> после правок — прогонять «Команды проверки». Ничего из перечисленного ниже не ломать.

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
pnpm run test              # 7/7
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
   `pnpm --filter @workspace/db run push`. `createTableIfMissing: false` в PgStore — НЕ включать.
   Миграций нет: схема остальных таблиц — только drizzle-kit push.
8. **`SESSION_SECRET` обязателен** (сервер падает без него), `DATABASE_URL` приходит только как секрет в Replit — `.env`/секции `database` в репо не создавать.
9. **`X-Frame-Options` не ставить** (может сломать iframe-превью Replit). Добавлен только `X-Content-Type-Options: nosniff`.
10. **`minimumReleaseAge: 1440`** в `pnpm-workspace.yaml` — пакеты младше 24 ч не встанут; не удалять и не «чинить» добавлением в `minimumReleaseAgeExclude` без явного решения пользователя.
11. Cookie: `secure: isProduction`, `sameSite: production → "none"`, `trust proxy = 1` — не менять без проверки.
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

## 3. Изменения (проблема → фикс → файлы)

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

## 6. Окружение и известные ограничения

- **Docker невозможен локально**: WSL не установлен (`wsl --status` → требуется установка). Для e2e использовался `embedded-postgres` (PostgreSQL 18.4, порт 5433) в `%TEMP%\opencode\pgtest\` — **временно**, системные изменения не вносились.
- Временные креды тестовой БД: `postgresql://postgres:pw-test-123@127.0.0.1:5433/stockkeeper` (только для тестов, не для прода).
- `forgot-password` без настроенного SMTP/Resend отвечает **503** — это ожидаемо (токен при этом уже создаётся в БД).
- Пароль от реального сервера БД `83.147.243.54` и `DATABASE_URL` пользователь вводит сам как секрет в Replit.
- `websearch` (exa) даёт 403 — для advisory использовать `webfetch` на `github.com/advisories`.
- **GHAS**: StockKeeper приватный, CodeQL и Dependency Review без лицензии GitHub Advanced Security не
  работают → закрыты guard'ом `private == false` (в awg-easy работают, т.к. тот репозиторий публичный).
  Если подключат GHAS — убрать guard в `codeql.yml`/`dependency-review.yml`.
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
