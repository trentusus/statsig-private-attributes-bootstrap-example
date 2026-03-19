import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';

import { Statsig, StatsigUser } from '@statsig/statsig-node-core';

const GATE_NAME = process.env.STATSIG_GATE_NAME ?? 'new_checkout_experience';
const PORT = Number(process.env.PORT ?? 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_BUNDLE_PATH = path.join(__dirname, 'dist', 'client.bundle.js');

const app = express();
app.use(cookieParser());
app.use(express.json());

const statsig = new Statsig(process.env.STATSIG_SERVER_KEY);
await statsig.initialize();

function getOrCreateStableID(req, res) {
  const existing = req.cookies['statsig_stable_id'];
  if (existing) {
    return existing;
  }

  const stableID = crypto.randomUUID();
  res.cookie('statsig_stable_id', stableID, {
    httpOnly: false,
    sameSite: 'lax',
    // Use false so the sample works on local http://localhost during demos.
    secure: false,
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return stableID;
}

function getBootstrapRequestUser(body) {
  const user = body?.user;
  if (user == null || typeof user !== 'object' || Array.isArray(user)) {
    return null;
  }

  const hasUserID =
    typeof user.userID === 'string' && user.userID.trim().length > 0;
  const hasCustomIDs =
    user.customIDs != null &&
    typeof user.customIDs === 'object' &&
    !Array.isArray(user.customIDs) &&
    Object.keys(user.customIDs).length > 0;

  if (!hasUserID && !hasCustomIDs) {
    return null;
  }

  return user;
}

function buildStatsigUser(clientUser, stableID) {
  return new StatsigUser({
    ...clientUser,
    customIDs: {
      ...(clientUser.customIDs ?? {}),
      stableID,
    },
  });
}

function logBootstrapInputs(clientUser, statsigUser) {
  console.log(
    '[server] client user received for bootstrap',
    JSON.stringify(
      {
        userID: clientUser.userID,
        hasPrivateAttributes: clientUser.privateAttributes != null,
      },
      null,
      2,
    ),
  );

  console.log(
    '[server] evaluation summary',
    JSON.stringify(
      {
        userID: statsigUser.userID,
        privateEmailUsedForEvaluation:
          statsigUser.privateAttributes?.email ?? null,
        stableID: statsigUser.customIDs?.stableID ?? null,
      },
      null,
      2,
    ),
  );
}

function getBootstrapValues(statsigUser) {
  return statsig.getClientInitializeResponse(statsigUser, {
    clientSdkKey: process.env.STATSIG_CLIENT_KEY,
    hashAlgorithm: 'djb2',
    featureGateFilter: new Set([GATE_NAME]),
  });
}

function buildBootstrapSummary(statsigUser, bootstrapValues) {
  return {
    serverEvaluatedWithPrivateAttributes:
      statsigUser.privateAttributes != null,
    getClientInitializeResponseRunsLocally: true,
    bootstrapResponseHasPrivateAttributes:
      bootstrapValues.user?.privateAttributes != null,
    bootstrapResponseHasPrivateAttributeHash:
      bootstrapValues.pa_hash != null,
  };
}

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Statsig Bootstrap Private Attributes Example</title>
  </head>
  <body>
    <script>
      globalThis.process = {
        env: {
          STATSIG_CLIENT_KEY: ${JSON.stringify(process.env.STATSIG_CLIENT_KEY)},
          STATSIG_GATE_NAME: ${JSON.stringify(GATE_NAME)},
        },
      };
    </script>
    <script type="module" src="/client.bundle.js"></script>
  </body>
</html>`);
});

app.get('/client.bundle.js', (_req, res) => {
  const bundle = fs.readFileSync(CLIENT_BUNDLE_PATH, 'utf8');
  res.type('js').send(bundle);
});

app.post('/api/statsig/bootstrap', (req, res) => {
  const clientUser = getBootstrapRequestUser(req.body);
  if (clientUser == null) {
    res.status(400).json({
      error:
        'Expected req.body.user with at least userID or customIDs for bootstrapping.',
    });
    return;
  }

  // Step 1: build the server-side Statsig user from the client user.
  const stableID = getOrCreateStableID(req, res);
  const statsigUser = buildStatsigUser(clientUser, stableID);
  logBootstrapInputs(clientUser, statsigUser);

  // Step 2: compute the bootstrapped response on the server.
  const initializeResponse = getBootstrapValues(statsigUser);
  const bootstrapValues = JSON.parse(initializeResponse);
  const bootstrappedUser = bootstrapValues.user;
  const demoSummary = buildBootstrapSummary(statsigUser, bootstrapValues);

  // Step 3: return a small summary along with the bootstrapped values.
  console.log(
    '[server] bootstrap summary',
    JSON.stringify(demoSummary, null, 2),
  );

  res.json({
    user: bootstrappedUser,
    initializeResponse,
    demoSummary,
  });
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
