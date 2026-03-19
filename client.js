import { StatsigClient } from '@statsig/js-client';

const CLIENT_KEY =
  globalThis.process?.env?.STATSIG_CLIENT_KEY ?? 'client-REPLACE_ME';
const GATE_NAME =
  globalThis.process?.env?.STATSIG_GATE_NAME ?? 'new_checkout_experience';

// This is the client-owned StatsigUser sent to your server for bootstrap.
// The private attribute is used for server-side evaluation and is not sent to Statsig by the browser.
const clientUser = {
  userID: 'user-123',
  privateAttributes: {
    email: 'client-side-private@example.com',
  },
};

function summarizeGateExposure(requestBody) {
  const exposureEvent = Array.isArray(requestBody?.events)
    ? requestBody.events.find(
        (event) => event?.eventName === 'statsig::gate_exposure',
      )
    : null;

  if (exposureEvent == null) {
    return null;
  }

  return {
    gate: exposureEvent.metadata?.gate ?? null,
    gateValue: exposureEvent.metadata?.gateValue ?? null,
    exposureUser: exposureEvent.user ?? null,
    gateExposureHasPrivateAttributes:
      exposureEvent.user?.privateAttributes != null,
  };
}

function createNetworkOverride(onGateExposureLogged) {
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

    const gateExposureSummary = summarizeGateExposure(parsedBody);

    if (gateExposureSummary != null) {
      const exposureSummary = {
        url,
        ...gateExposureSummary,
      };

      onGateExposureLogged(exposureSummary);
      console.log(
        '[client] checkGate exposure sent to Statsig',
        JSON.stringify(exposureSummary, null, 2),
      );
    }

    return fetch(url, args);
  };
}

function renderResults(gateValue, privacyChecks, exposureSummary) {
  document.body.innerHTML = `
    <main style="font-family: sans-serif; max-width: 720px; margin: 40px auto; line-height: 1.5;">
      <h1>Gate: ${GATE_NAME} is ${gateValue ? 'enabled' : 'disabled'}</h1>
      <p>This page shows the privacy checks that matter for this bootstrap flow.</p>
      <ul>
        <li>Server evaluated with privateAttributes: ${yesNo(privacyChecks.serverEvaluatedWithPrivateAttributes)}</li>
        <li>getClientInitializeResponse ran locally on the server: ${yesNo(privacyChecks.getClientInitializeResponseRunsLocally)}</li>
        <li>Bootstrap response contained raw privateAttributes: ${yesNo(privacyChecks.bootstrapResponseHasPrivateAttributes)}</li>
        <li>Bootstrap response contained private attribute hash: ${yesNo(privacyChecks.bootstrapResponseHasPrivateAttributeHash)}</li>
        <li>checkGate exposure sent privateAttributes: ${yesNo(exposureSummary?.gateExposureHasPrivateAttributes)}</li>
      </ul>
      <p>Open the console to see the smaller request and response summaries.</p>
    </main>
  `;
}

async function fetchBootstrapFromServer() {
  console.log(
    '[client] sending user to your server for bootstrap',
    JSON.stringify(clientUser, null, 2),
  );

  const response = await fetch('/api/statsig/bootstrap', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      user: clientUser,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bootstrap request failed: ${response.status}`);
  }

  const { user: bootstrappedUser, initializeResponse, demoSummary } =
    await response.json();
  const bootstrapValues = JSON.parse(initializeResponse);

  console.log(
    '[client] bootstrap summary from your server',
    JSON.stringify(
      {
        bootstrappedUser,
        bootstrapResponseHasPrivateAttributes:
          bootstrappedUser?.privateAttributes != null,
        bootstrapResponseHasPrivateAttributeHash:
          bootstrapValues.pa_hash != null,
        serverSummary: demoSummary,
      },
      null,
      2,
    ),
  );

  return {
    bootstrappedUser,
    bootstrapValues,
    initializeResponse,
    privacyChecks: demoSummary,
  };
}

async function initializeStatsigFromBootstrap() {
  // Step 1: ask your server for a bootstrapped response for this user.
  const { bootstrappedUser, initializeResponse, privacyChecks } =
    await fetchBootstrapFromServer();

  // Step 2: create the browser SDK with the same user shape.
  let latestExposureSummary = null;
  const browserUser = {
    ...bootstrappedUser,
    privateAttributes: clientUser.privateAttributes,
  };

  const client = new StatsigClient(CLIENT_KEY, browserUser, {
    disableCompression: true,
    networkConfig: {
      networkOverrideFunc: createNetworkOverride((summary) => {
        latestExposureSummary = summary;
      }),
    },
  });

  // Step 3: initialize only from the server-provided bootstrap data.
  client.dataAdapter.setData(initializeResponse);
  client.initializeSync({
    disableBackgroundCacheRefresh: true,
  });

  return {
    client,
    privacyChecks,
    getLatestExposureSummary: () => latestExposureSummary,
  };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

async function render() {
  const { client, privacyChecks, getLatestExposureSummary } =
    await initializeStatsigFromBootstrap();

  // Step 4: check the gate in the browser and flush the exposure event.
  const gateValue = client.checkGate(GATE_NAME);
  await client.flush();
  const exposureSummary = getLatestExposureSummary();

  // Step 5: render the result and the privacy checks on the page.
  renderResults(gateValue, privacyChecks, exposureSummary);
}

render().catch((error) => {
  console.error(error);
});
