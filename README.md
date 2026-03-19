# Statsig bootstrap example: JS client + Node server + private attributes

This runnable sample app shows the safe pattern for:

- Evaluating a feature gate with `privateAttributes`
- Keeping those `privateAttributes` on your Node server
- Bootstrapping `@statsig/js-client` asynchronously from your own backend
- Avoiding a browser `initialize` call to Statsig

## Why this pattern works

1. The Node server builds the `StatsigUser` and sets `privateAttributes`.
2. The Node server calls `getClientInitializeResponse(...)` to evaluate gates locally.
3. The browser fetches the precomputed initialize response from your backend.
4. The browser loads that response with `client.dataAdapter.setData(...)`.
5. The browser calls `client.initializeSync({ disableBackgroundCacheRefresh: true })`.

That last step is important: it prevents the JS client from doing a background refresh that would otherwise make an `initialize` request from the browser.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your Statsig keys and the gate name you want to demo
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Files

- `server.js`: Express app that serves the demo page and evaluates with `privateAttributes`
- `client.js`: Browser-side async bootstrap + gate check
- `.env.example`: required Statsig SDK key placeholders
- `.gitignore`: excludes `.env`, build output, and local dependencies

## What to look for in the logs

- The server logs `evaluation user (server-only)`, which includes `privateAttributes.email`.
- The server logs `bootstrap payload returned to browser`, which shows `user`, `pa_hash`, and `includesPrivateAttributes: false`.
- The browser logs `bootstrap payload received from server`, which should not contain `user.privateAttributes`.
- The browser logs `outgoing Statsig request`, which lets you inspect the actual payload sent to Statsig for the exposure event after `checkGate(...)`.

With this setup, you should see:

- No browser `/initialize` request to Statsig
- A browser `/log_event` request after the gate check flushes
- No `privateAttributes` field in the logged event payload

## Notes

- This keeps `privateAttributes` from being sent to Statsig by the browser.
- `STATSIG_GATE_NAME` is included in the env template so the server filter and client gate check stay aligned.
- The bootstrap response may include `pa_hash`, which is a hash derived from the private attributes, not the raw private values.
- Exposure or custom event logging from the browser can still happen, but those will use the public user object you pass to the client, not the server-only `privateAttributes`.
- If you also want zero browser traffic to Statsig, you would need to disable client network traffic separately and handle exposure logging some other way.
- In a real app, derive sensitive fields such as email from your server session or database instead of trusting client input.
