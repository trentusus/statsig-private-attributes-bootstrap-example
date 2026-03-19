# Statsig bootstrap example: JS client + Node server + private attributes

This sample shows a simple pattern for evaluating a gate with `privateAttributes` without sending those raw private values to Statsig from the browser.

## The 3-step flow

1. The client creates a `StatsigUser` with `userID` and `privateAttributes`, then sends that user to your server.
2. The server calls `getClientInitializeResponse(...)`, so evaluation with the private attribute happens on the server.
3. The client loads the bootstrapped values and runs `checkGate(...)`, but the exposure event sent to Statsig does not include `privateAttributes`.

## What the server does

- Receives the client user object at `POST /api/statsig/bootstrap`
- Adds a `stableID`
- Calls `getClientInitializeResponse(...)`
- Returns the bootstrapped values to the browser

In this sample, `getClientInitializeResponse(...)` runs locally on the server. It does not make a browser initialize call to Statsig.

## What the client does

- Defines the demo `StatsigUser` in [client.js](/Users/tkalischsmith/statsig-code/customer-snippets/js-client-node-core-bootstrap-private-attributes/client.js)
- Sends that user to your server for bootstrapping
- Loads the bootstrapped response into `@statsig/js-client`
- Calls `checkGate(...)`
- Flushes the exposure event so you can verify that no raw `privateAttributes` were sent

## What the demo page shows

When you open the sample app, the page itself shows:

- whether the gate is enabled
- whether the server evaluated with `privateAttributes`
- whether `getClientInitializeResponse(...)` ran locally on the server
- whether the bootstrap response contained raw `privateAttributes`
- whether the bootstrap response contained `pa_hash`
- whether the `checkGate(...)` exposure sent `privateAttributes`

## What to look for in the console

- `[client] sending user to your server for bootstrap`
- `[server] evaluation summary`
- `[server] bootstrap summary`
- `[client] bootstrap summary from your server`
- `[client] checkGate exposure sent to Statsig`

Those logs are intentionally small so a new reader can follow the privacy boundary without digging through the full initialize payload.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in `STATSIG_SERVER_KEY`, `STATSIG_CLIENT_KEY`, and `STATSIG_GATE_NAME`
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Files

- [server.js](/Users/tkalischsmith/statsig-code/customer-snippets/js-client-node-core-bootstrap-private-attributes/server.js): Express server that bootstraps Statsig with the client user
- [client.js](/Users/tkalischsmith/statsig-code/customer-snippets/js-client-node-core-bootstrap-private-attributes/client.js): browser demo that sends the user to the server, runs `checkGate(...)`, and shows the privacy checks on the page
- [.env.example](/Users/tkalischsmith/statsig-code/customer-snippets/js-client-node-core-bootstrap-private-attributes/.env.example): required env vars

## Note for real apps

This sample intentionally keeps the private attribute visible in the client code so the flow is easy to understand. In a real application, sensitive values such as email are usually derived on the server from your authenticated session or database rather than trusted from client input.
