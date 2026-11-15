# stencil-api

The small server behind [www.gdxlabs.com/stencil](https://www.gdxlabs.com/stencil/).
The page is static (GitHub Pages), so it cannot hold a LiteLLM key; this
service holds one and offers exactly one thing with it: *draw this prompt as
a stencil*. Everything after the SVG — threshold, bridges, plate, STL — runs
in the visitor's browser (`js/stencil/`).

```
browser ──POST /api/stencil/jobs──► stencil-api ──/v1/chat/completions──► LiteLLM ──► llama-swap
        ◄──GET  /api/stencil/jobs/:id (poll)        model: stencil-diffuser       Sana-Sprint + binary VTracer
```

## API

| | |
| --- | --- |
| `POST /api/stencil/jobs` `{"prompt": "a wolf head"}` | `202 {id, status: "queued"\|"running", position?}`, or `200 {…, status: "done", svg}` when that prompt was drawn before |
| `GET /api/stencil/jobs/:id` | `{id, status, prompt, position?, svg?, viewBox?, stats?, error?}` |
| `GET /api/healthz`, `/api/readyz` | `{ok, model, queued, running}` |

- One draw at a time (the platform's model slot is exclusive anyway); at most
  `MAX_QUEUED` waiting, then `503` with `Retry-After`.
- The job id hashes route + prompt version + normalised prompt. The route
  derives its noise seed from the prompt, so the same prompt is the same
  stencil: repeats cost nothing and are served from `STENCIL_CACHE_DIR`.
- Rate limit per client IP on *new* draws only: `RATE_BURST` (3), then one per
  `RATE_REFILL_MS` (10 min). `429` with `Retry-After`.
- CORS only for `ALLOWED_ORIGINS`.
- The SVG passes through AllBlobs' sanitiser (`src/svg.js`, copied verbatim).

## The LiteLLM key

One virtual key per service, scoped to this route only:

```bash
curl -sS https://large.pwaxx.com/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H 'Content-Type: application/json' \
  -d '{"key_alias":"gdxlabs-stencil","models":["stencil-diffuser"],"rpm_limit":10,"max_parallel_requests":2}'
```

Put the returned `sk-…` into the GitLab CI/CD variable `LITELLM_API_KEY`
(masked, protected). The route itself comes from `ore0n/large-platform`
(`stencil-diffuser`, production only).

## Deploy

`.gitlab-ci.yml` at the repository root builds `stencil-api/Dockerfile` and
deploys `stencil-api/k8s/` to the platform's k3s cluster on a tag (manual on
`main`), the same way AllBlobs deploys. Variables: `KUBECONFIG_CONTENT`,
`KUBE_NAMESPACE`, `STENCIL_HOST`, `ACME_EMAIL`, `LITELLM_API_KEY`, optionally
`LITELLM_URL` / `KUBE_LITELLM_NAMESPACE`. `STENCIL_HOST` needs a DNS A record
to the cluster; the page's default API host is in `js/stencil/config.js`
(override per visit with `?api=https://host`).

## Local

```bash
cd stencil-api
npm test
LITELLM_URL=https://large.pwaxx.com LITELLM_API_KEY=sk-... \
  ALLOWED_ORIGINS=http://127.0.0.1:8000 PORT=8099 node src/server.js
# in the repo root: python3 -m http.server 8000
# open http://127.0.0.1:8000/stencil/?api=http://127.0.0.1:8099
```
