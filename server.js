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

app.get('/api/statsig/bootstrap', (req, res) => {
  // Replace this with your real auth/session lookup.
  const authenticatedUser = {
    id: 'user-123',
    email: 'someone@example.com',
  };

  if (!authenticatedUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const stableID = getOrCreateStableID(req, res);

  const statsigUser = new StatsigUser({
    userID: authenticatedUser.id,
    customIDs: {
      stableID,
    },
  });

  // Sensitive fields stay on the server and are only used for evaluation.
  statsigUser.privateAttributes = {
    email: authenticatedUser.email,
  };

  console.log(
    '[server] evaluation user (server-only)',
    JSON.stringify(statsigUser.toJSON(), null, 2),
  );

  const initializeResponse = statsig.getClientInitializeResponse(statsigUser, {
    clientSdkKey: process.env.STATSIG_CLIENT_KEY,
    hashAlgorithm: 'djb2',
    featureGateFilter: new Set([GATE_NAME]),
  });

  const parsedInitializeResponse = JSON.parse(initializeResponse);
  console.log(
    '[server] bootstrap payload returned to browser',
    JSON.stringify(
      {
        user: parsedInitializeResponse.user,
        pa_hash: parsedInitializeResponse.pa_hash,
        includesPrivateAttributes:
          parsedInitializeResponse.user?.privateAttributes != null,
      },
      null,
      2,
    ),
  );

  // Send only the public user shape the browser should keep using.
  const publicUser = {
    userID: authenticatedUser.id,
    customIDs: {
      stableID,
    },
  };

  res.json({
    user: publicUser,
    initializeResponse,
  });
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
