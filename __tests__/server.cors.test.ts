import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

vi.mock('@seedprotocol/feed', () => ({
  handleFeedRequest: vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response('<rss></rss>', {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/rss+xml' }),
      })
    )
  ),
  handleArchiveFeedRequest: vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response('<rss archive></rss>', {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/rss+xml' }),
      })
    )
  ),
}));

import { createSeedProtocolFeedServer } from '../src/server';

describe('Feed server CORS', () => {
  let app: ReturnType<typeof createSeedProtocolFeedServer>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    app = createSeedProtocolFeedServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET responses include Access-Control-Allow-Origin *', async () => {
    const res = await request(app).get('/post/rss');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('OPTIONS preflight allows If-None-Match', async () => {
    const res = await request(app)
      .options('/post/rss')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'if-none-match');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const allowHeaders = res.headers['access-control-allow-headers'];
    expect(allowHeaders).toBeDefined();
    expect(String(allowHeaders).toLowerCase()).toContain('if-none-match');
  });
});
