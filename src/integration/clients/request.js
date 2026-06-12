'use strict';

/**
 * Shared HTTP core for the provider clients — the skeleton that was identical
 * across the ClickUp/Asana/Trello request() siblings, extracted once the rule
 * of three fired. The skeleton is generic; every provider quirk stays in the
 * client that owns it, passed in as a hook:
 *
 *   name              log/error prefix, e.g. 'trelloClient'
 *   baseUrl           provider API root
 *   authStrategy()    returns the auth strategy; called per request so a
 *                     missing env var fails loudly at call time, not at
 *                     module load
 *   retryDelayMs(res) how long to wait on a 429, from the provider's header
 *                     (or fixed window); the core clamps it to 1s–60s
 *   errorMessage(json, text)
 *                     human-readable message from an error body; `json` is {}
 *                     when the body wasn't JSON, `text` is the raw body
 *   wrapBody(body)    optional request envelope (Asana's { data })
 *   unwrapResponse(json)
 *                     optional response envelope
 *
 * Bodies are read once as text with JSON.parse attempted on top — some
 * providers (Trello) send plain-text errors, and the superset behavior is
 * harmless for the JSON-only ones.
 */

const identity = (value) => value;

function createRequest({
  name,
  baseUrl,
  authStrategy,
  retryDelayMs,
  errorMessage,
  wrapBody = identity,
  unwrapResponse = identity,
}) {
  return async function request(method, path, body) {
    const auth = authStrategy();

    const doFetch = async () =>
      fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(await auth.getAuthHeaders()),
        },
        body: body === undefined ? undefined : JSON.stringify(wrapBody(body)),
      });

    let res = await doFetch();

    // Wait out the provider's rate-limit window and retry once, then give up
    // and let the thrown error become a redelivery once a broker fronts this.
    // Scaffolding: when the broker lands, delete this block (throw -> nack ->
    // delayed redelivery) and throttle below the provider limit instead.
    if (res.status === 429) {
      const waitMs = Math.min(Math.max(retryDelayMs(res), 1_000), 60_000);
      console.warn(`[${name}] rate limited; retrying in ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      res = await doFetch();
    }

    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON; `text` already holds whatever the provider sent
    }

    if (!res.ok) {
      throw new Error(
        `[${name}] ${method} ${path} -> ${res.status}: ` +
          `${errorMessage(json, text) || 'unknown error'}`
      );
    }

    return unwrapResponse(json);
  };
}

module.exports = { createRequest };
