# Docker deployment preparation

This setup runs two containers, either pulled from GitHub Container Registry
(GHCR) or built locally on the Docker host (see "Building images locally"
below):

- `web`: Caddy serves the built StockKeeper interface, proxies `/api` to the API
  container, and obtains HTTPS certificates for `APP_DOMAIN`.
- `api`: the Node.js API. It connects to the existing PostgreSQL server on the
  Docker host; Compose does not create or publish a PostgreSQL container.

The private images are `ghcr.io/fast-iq/stockkeeper-api` and
`ghcr.io/fast-iq/stockkeeper-web`. GitHub Actions publishes `latest` and a full
commit-SHA tag when code is pushed to `main`, and supports manual runs from
`main`. The workflow requires the repository Actions variable
`VITE_GOOGLE_CLIENT_ID`; it fails before either image is published if the
variable is missing. Set it to the public Google OAuth client ID configured for
the final HTTPS origin. The host's `GOOGLE_CLIENT_ID` must use the same value.

The frontend and API share one HTTPS origin. This preserves the relative `/api`
requests and secure `SameSite=Lax` session cookies.

## Host requirements

- Docker Engine with the Docker Compose plugin.
- A working DNS hostname pointing to this host, with inbound TCP ports 80 and
  443 available for Caddy's certificate issuance and HTTPS traffic.
- The existing PostgreSQL server reachable from the API container. Compose maps
  `host.docker.internal` to the Docker host on Linux. PostgreSQL and the host
  firewall must allow the container's private bridge connection; do not expose
  the database port to the public internet for this setup.
- Access to the private GHCR packages. Authenticate on the Docker host with a
  GitHub personal access token that has `read:packages`; keep it in Docker's
  credential store and do not put it in the application environment file.
- A Google OAuth client configured for the final HTTPS origin.

The hostname must resolve before starting Caddy. The FirstByte hostname checked
for this project returned DNS `SERVFAIL` on 2026-10-04; fix its DNS or use a
working hostname first. An IP-only URL is not a substitute for HTTPS here.

## Runtime environment

Store runtime values in a host-only environment file outside the repository,
for example `/etc/stockkeeper/stockkeeper.env`, with file permissions restricted
to the deployment user. Do not commit that file or put runtime database/session/
SMTP secrets in GitHub.

Required variables:

| Variable           | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `APP_DOMAIN`       | Working public hostname used by Caddy and the API CORS allowlist      |
| `GOOGLE_CLIENT_ID` | Public OAuth client ID, also embedded in the web build                |
| `SESSION_SECRET`   | Session signing secret                                                |
| `EXTERNAL_DB_URL`  | Existing PostgreSQL connection string for the API                     |
| `IMAGE_TAG`        | Optional GHCR tag; defaults to `latest`, or pin to a full `sha-…` tag |

Optional email fallback variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`, and `RESEND_FROM_EMAIL`. The application currently
tries the Replit Resend connector first and then SMTP; configure SMTP for
password-reset email delivery on a non-Replit host. The container setup does
not add a standalone Resend API-key integration.

For `EXTERNAL_DB_URL`, use the database provider's approved TLS settings and
certificate hostname. The `host.docker.internal` alias is available when the
connection should go to PostgreSQL on this same machine; do not disable
certificate validation to work around a hostname mismatch.

## Pull and validate

Create the environment file on the server, outside the checkout. Log in to GHCR
using a GitHub account with access to the private packages, then validate the
Compose configuration and pull the published images:

```sh
sudo install -d -m 700 /etc/stockkeeper
sudo install -m 600 /dev/null /etc/stockkeeper/stockkeeper.env
sudoedit /etc/stockkeeper/stockkeeper.env

# Authenticate interactively; use a token with read:packages when prompted.
docker login ghcr.io --username YOUR_GITHUB_USERNAME

docker compose \
  --env-file /etc/stockkeeper/stockkeeper.env \
  -f deploy/docker/compose.yaml config --quiet

docker compose \
  --env-file /etc/stockkeeper/stockkeeper.env \
  -f deploy/docker/compose.yaml pull
```

To pin both containers to one published commit, set `IMAGE_TAG=sha-<full-commit-sha>`
in the host environment file. `latest` follows the most recent successful push
to `main`; run `docker compose pull` again to fetch a newer image.

## Building images locally instead of pulling

If the GHCR images are not available yet — the first workflow run stops before
publishing until the `VITE_GOOGLE_CLIENT_ID` Actions variable is set — build
both images on the Docker host from a full repository checkout:

```sh
docker compose \
  --env-file /etc/stockkeeper/stockkeeper.env \
  -f deploy/docker/compose.yaml build
```

The web image receives `GOOGLE_CLIENT_ID` from the environment file as the
`VITE_GOOGLE_CLIENT_ID` build argument; both must equal the OAuth client ID of
the final HTTPS origin. Local builds keep the same `ghcr.io/...` image names,
so a later `docker compose pull` replaces them once the workflow publishes
images. Use `up -d --build` to rebuild after code changes.

## Before starting containers

The production API applies tracked database migrations to `EXTERNAL_DB_URL`
before it starts listening. Do not run `docker compose up` until the connection
string has been checked against the intended database and an appropriate backup
and migration review have been completed. This preparation does not start the
containers or apply migrations.

After those checks and once DNS/TLS prerequisites are met, the host operator can
start the services with:

```sh
docker compose \
  --env-file /etc/stockkeeper/stockkeeper.env \
  -f deploy/docker/compose.yaml up -d
```
