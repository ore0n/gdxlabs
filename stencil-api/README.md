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

## The nightly loop

`prompts.txt` is a list of ready-made motifs, one prompt per line. With
`PRECACHE_ENABLED=1` the service draws them overnight so the page's **Library**
tab is full and popular prompts are instant. It is a loop inside the API
process (not a CronJob), modelled on AllBlobs' pre-cache:

- only inside `PRECACHE_WINDOW` (default `01:00-06:00`, local time in `PRECACHE_TZ`);
- at most `PRECACHE_PER_DAY` draws a day (default 20), counted in `_precache.json` beside the cache;
- only when nothing is queued or running and no visitor has asked for anything for `PRECACHE_IDLE_MS` (30 s), so visitors never wait behind it for more than the one stencil in flight;
- a prompt that failed is left alone for a day, then two, then four, and after four attempts never again.

Edit `prompts.txt` and deploy to change the list; a changed line is drawn anew,
a removed one keeps its stencil in the cache. To switch the loop off set
`PRECACHE_ENABLED` to `"0"` in `k8s/deployment.yaml` (or
`kubectl -n <ns> set env deployment/stencil-api PRECACHE_ENABLED=0`): drawn
stencils stay and the Library keeps listing them.

Extra endpoints: `GET /api/stencil/library` (the drawn motifs, `{items:[{id,prompt}]}`)
and `GET /api/stencil/jobs/:id.svg` (a drawn stencil as an image, for thumbnails).

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
deploys `stencil-api/k8s/` to the platform's k3s cluster automatically: on every
tag, and on every push to `main` that touches `stencil-api/` or the pipeline
file (site-only changes do not redeploy the API). It is its own deployment next
to the platform; large-platform only provides the `stencil-diffuser` route. Variables: `KUBECONFIG_CONTENT`,
`KUBE_NAMESPACE`, `STENCIL_HOST`, `ACME_EMAIL`, `LITELLM_API_KEY`, optionally
`LITELLM_URL` / `KUBE_LITELLM_NAMESPACE`. `STENCIL_HOST` needs a DNS A record
to the cluster; the page's default API host is in `js/stencil/config.js`
(override per visit with `?api=https://host`).

## Releasing: `scripts/sync.sh`

`scripts/sync.sh` is the release script shared byte-for-byte with allblobs and
large-platform. Run it on a `claude/…` or `codex/…` branch: it merges the
branch into GitLab's `main`, tags the merge with the next `release-N`, pushes
(the tag starts `deploy-production`) and mirrors `main` back to GitHub.

```bash
./scripts/sync.sh --dry-run   # what the next release would be
./scripts/sync.sh             # merge, tag, deploy, mirror
```

It needs a second remote that points at the GitLab project (`git remote add
gitlab git@<host>:<group>/gdxlabs.git`, or `GITLAB_REMOTE=<name>` for a
self-hosted host) and at least one tag on GitLab's `main` to count from:
`git tag -a release-0 -m 'first release' && git push gitlab release-0`.

## Local

```bash
cd stencil-api
npm test
LITELLM_URL=https://large.pwaxx.com LITELLM_API_KEY=sk-... \
  ALLOWED_ORIGINS=http://127.0.0.1:8000 PORT=8099 node src/server.js
# in the repo root: python3 -m http.server 8000
# open http://127.0.0.1:8000/stencil/?api=http://127.0.0.1:8099
```
