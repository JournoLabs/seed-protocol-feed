import cors, { type CorsOptions } from 'cors';
import type { Response as ExpressResponse } from 'express';

export const publicFeedCorsOptions: CorsOptions = {
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['If-None-Match', 'Accept'],
};

export const publicFeedCorsMiddleware = cors(publicFeedCorsOptions);

const ACCESS_CONTROL_HEADER_NAMES = new Set([
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
  'access-control-allow-credentials',
]);

/** Copy upstream feed headers, skipping any Access-Control-* from the SDK. */
export function copyUpstreamFeedHeaders(res: ExpressResponse, upstream: Response): void {
  upstream.headers.forEach((value, key) => {
    if (ACCESS_CONTROL_HEADER_NAMES.has(key.toLowerCase())) {
      return;
    }
    res.set(key, value);
  });
}

/** Public read-only feeds: allow browser fetch from any origin (no credentials). */
export function setPublicFeedCorsHeaders(res: ExpressResponse): void {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'If-None-Match, Accept',
  });
}
