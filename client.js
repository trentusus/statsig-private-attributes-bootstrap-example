import { StatsigClient } from '@statsig/js-client';

const CLIENT_KEY =
  globalThis.process?.env?.STATSIG_CLIENT_KEY ?? 'client-REPLACE_ME';
const GATE_NAME =
  globalThis.process?.env?.STATSIG_GATE_NAME ?? 'new_checkout_experience';

function createLoggingNetworkOverride() {
  return async (url, args) => {
    const bodyText =
      typeof args.body === 'string'
        ? args.body
        : args.body == null
          ? null
          : String(args.body);

    let parsedBody = null;
    if (bodyText != null) {
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        parsedBody = bodyText;
      }
    }

    console.log(
      '[client] outgoing Statsig request',
      JSON.stringify(
        {
          url,
          method: args.method,
          body: parsedBody,
        },
        null,
        2,
      ),
    );

    return fetch(url, args);
  };
}

export async function initializeStatsigFromBootstrap() {
  const response = await fetch('/api/statsig/bootstrap', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Bootstrap request failed: ${response.status}`);
  }

  const { user, initializeResponse } = await response.json();

  // The browser only receives the public user object, not privateAttributes.
  console.log(
    '[client] bootstrap payload received from server',
    JSON.stringify(
      {
        user,
        parsedInitializeResponse: JSON.parse(initializeResponse),
      },
      null,
      2,
    ),
  );

  const client = new StatsigClient(CLIENT_KEY, user, {
    disableCompression: true,
    networkConfig: {
      networkOverrideFunc: createLoggingNetworkOverride(),
    },
  });

  client.dataAdapter.setData(initializeResponse);

  // Initialize from the bootstrapped payload only.
  // This avoids a browser initialize request back to Statsig.
  client.initializeSync({
    disableBackgroundCacheRefresh: true,
  });

  return client;
}

async function render() {
  const client = await initializeStatsigFromBootstrap();
  const gateValue = client.checkGate(GATE_NAME);
  await client.flush();

  document.body.innerHTML = gateValue
    ? `<h1>Gate: ${GATE_NAME} is enabled</h1>`
    : `<h1>Gate: ${GATE_NAME} is disabled</h1>`;
}

render().catch((error) => {
  console.error(error);
});
