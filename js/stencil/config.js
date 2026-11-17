// Where the stencil API runs (stencil-api/ in this repo, deployed to the k3s
// cluster). The page itself is static; only prompts go there.
//
// `?api=https://host` overrides it for testing a deployment before the
// default points at it.
const DEFAULT_API = "https://gdx.pwaxx.com";

function fromQuery() {
  try {
    const value = new URLSearchParams(location.search).get("api");
    return value && /^https?:\/\/[^/]+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export const API_BASE = fromQuery() ?? DEFAULT_API;
