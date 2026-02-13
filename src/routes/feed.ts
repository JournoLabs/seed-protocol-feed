import { handleFeedRequest } from '@seedprotocol/feed';
import type { ApiHandler } from '../types';

export const getFeed: ApiHandler = async (req, res) => {
  const { schemaName, format } = req.params;
  console.log(`Getting feed for schema: ${schemaName} and format: ${format}`);
  
  // Extract If-None-Match header for conditional requests
  const ifNoneMatch = req.get('If-None-Match') || null;
  
  // Extract cache busting query parameters (v, _t, timestamp, etc.)
  // Supports: ?v=123, ?_t=123, ?timestamp=123, ?cb=123
  function getQueryParam(param: any): string | undefined {
    if (!param) return undefined;
    if (Array.isArray(param)) {
      return param.length > 0 ? String(param[0]) : undefined;
    }
    if (typeof param === 'string') {
      return param;
    }
    return String(param);
  }
  
  // Find first non-undefined cache busting parameter
  const v = getQueryParam(req.query.v);
  const _t = getQueryParam(req.query._t);
  const timestamp = getQueryParam(req.query.timestamp);
  const cb = getQueryParam(req.query.cb);
  
  // Use first available parameter (all are string | undefined from getQueryParam)
  const cacheBust: string | undefined = v ?? _t ?? timestamp ?? cb;
  
  const response = await handleFeedRequest(schemaName, format, ifNoneMatch, cacheBust);

  console.log(response.status)

  res.status(response.status)
  response.headers.forEach((value, key) => res.set(key, value))
  
  // For 304 responses, don't send body
  if (response.status === 304) {
    res.end();
  } else {
    res.send(await response.text())
  }
}