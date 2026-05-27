/**
 * api/index.js — Single entry point for all Vercel API routes.
 *
 * Uses serverless-http to wrap the Express app, ensuring correct
 * body parsing in Vercel's serverless environment.
 *
 * Reuses the Express app from server/index.js which already has
 * all /api/auth and /api/jira/* routes defined. This reduces the
 * serverless function count from 15 to 2 (this file + sync/worker).
 *
 * Routes covered:
 *   /api/auth               (POST GET DELETE)
 *   /api/jira/config        (GET POST)
 *   /api/jira/test-connection (POST)
 *   /api/jira/sync           (POST)
 *   /api/jira/sync/start     (POST)
 *   /api/jira/sync/status    (GET)
 *   /api/jira/dashboard      (GET)
 *   /api/jira/project-metadata (GET PATCH POST)
 *   /api/jira/issues         (GET)
 *   /api/jira/projects       (GET)
 *   /api/jira/analysts       (GET)
 *   /api/jira/statuses       (GET)
 *   /api/jira/metrics        (GET)
 *   /api/jira/board          (GET)
 *   /api/jira/cache/clear    (POST)
 *   /api/jira/cache/stats    (GET)
 *   /api/jira/system/status  (GET)
 *
 * NOT covered (handled separately):
 *   /api/jira/sync/worker    (CRON-only, kept as standalone function)
 */
import serverless from 'serverless-http';
import app from '../server/index.js';

export const handler = serverless(app);
export default handler;
