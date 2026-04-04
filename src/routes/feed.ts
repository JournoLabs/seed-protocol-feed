import { handleArchiveFeedRequest, handleFeedRequest } from '@seedprotocol/feed';
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

  const pageParam = getQueryParam(req.query.page);
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;

  // Page param: SDK will support as 5th arg once updated (see SDK_DEVELOPER_SUMMARY.md)
  const response = await (handleFeedRequest as (
    a: string,
    b: string,
    c?: string | null,
    d?: string,
    e?: number
  ) => Promise<Response>)(String(schemaName ?? ''), String(format ?? ''), ifNoneMatch, cacheBust, page);

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

export const getArchiveFeed: ApiHandler = async (req, res) => {
  const { schemaName, year, month, format } = req.params;
  console.log(`Getting archive feed for schema: ${schemaName}, ${year}/${month}, format: ${format}`);

  const yearNum = parseInt(String(year ?? ''), 10);
  const monthNum = parseInt(String(month ?? ''), 10);
  if (isNaN(yearNum) || yearNum < 1970 || yearNum > 2100) {
    res.status(400).json({ error: 'Invalid year' });
    return;
  }
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    res.status(400).json({ error: 'Invalid month' });
    return;
  }

  const ifNoneMatch = req.get('If-None-Match') || null;
  function getQueryParam(param: unknown): string | undefined {
    if (!param) return undefined;
    if (Array.isArray(param)) return param.length > 0 ? String(param[0]) : undefined;
    return typeof param === 'string' ? param : String(param);
  }
  const cacheBust = getQueryParam(req.query.v) ?? getQueryParam(req.query._t) ?? getQueryParam(req.query.timestamp) ?? getQueryParam(req.query.cb);

  try {
    const response = await handleArchiveFeedRequest(
      String(schemaName ?? ''),
      yearNum,
      monthNum,
      String(format ?? ''),
      ifNoneMatch,
      cacheBust
    );
    res.status(response.status);
    response.headers.forEach((value, key) => res.set(key, value));
    if (response.status === 304) {
      res.end();
    } else {
      res.send(await response.text());
    }
  } catch (err) {
    console.error('Archive feed error:', err);
    throw err;
  }
}