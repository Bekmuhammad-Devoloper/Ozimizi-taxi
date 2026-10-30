import { Agent } from 'https';

/**
 * HTTPS agent for every Telegraf instance. The production VPS (Eskiz) has no
 * working IPv6 route, and api.telegram.org resolves to an AAAA record first —
 * so force IPv4, keep connections alive and give up on a hung socket quickly
 * instead of waiting for the OS timeout.
 */
export const telegramAgent = new Agent({
  family: 4,
  keepAlive: true,
  keepAliveMsecs: 10_000,
  maxSockets: 32,
  timeout: 70_000,
});
