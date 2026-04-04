import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { getFeed, getArchiveFeed } from '../src/routes/feed';

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

describe('Feed Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeed', () => {
    it('passes page param to handleFeedRequest when provided', async () => {
      const req = {
        params: { schemaName: 'posts', format: 'rss' },
        query: { page: '2' },
        get: () => null,
        status: vi.fn().mockReturnThis(),
        set: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        set: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as unknown as Response;

      await getFeed(req, res);

      const { handleFeedRequest } = await import('@seedprotocol/feed');
      expect(handleFeedRequest).toHaveBeenCalledWith(
        'posts',
        'rss',
        null,
        undefined,
        2
      );
    });

    it('defaults page to 1 when not provided', async () => {
      const req = {
        params: { schemaName: 'posts', format: 'rss' },
        query: {},
        get: () => null,
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        set: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as unknown as Response;

      await getFeed(req, res);

      const { handleFeedRequest } = await import('@seedprotocol/feed');
      expect(handleFeedRequest).toHaveBeenCalledWith(
        'posts',
        'rss',
        null,
        undefined,
        1
      );
    });

    it('clamps invalid page to 1', async () => {
      const req = {
        params: { schemaName: 'posts', format: 'rss' },
        query: { page: '0' },
        get: () => null,
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        set: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as unknown as Response;

      await getFeed(req, res);

      const { handleFeedRequest } = await import('@seedprotocol/feed');
      expect(handleFeedRequest).toHaveBeenCalledWith(
        'posts',
        'rss',
        null,
        undefined,
        1
      );
    });
  });

  describe('getArchiveFeed', () => {
    it('returns 400 for invalid year', async () => {
      const req = {
        params: { schemaName: 'posts', year: '999', month: '03', format: 'rss' },
        query: {},
        get: () => null,
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getArchiveFeed(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid year' });
    });

    it('returns 400 for invalid month', async () => {
      const req = {
        params: { schemaName: 'posts', year: '2024', month: '13', format: 'rss' },
        query: {},
        get: () => null,
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getArchiveFeed(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid month' });
    });

    it('calls handleArchiveFeedRequest with path params and headers', async () => {
      const req = {
        params: { schemaName: 'posts', year: '2024', month: '03', format: 'rss' },
        query: {},
        get: (name: string) => (name === 'If-None-Match' ? '"abc"' : null),
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        set: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as unknown as Response;

      await getArchiveFeed(req, res);

      const { handleArchiveFeedRequest } = await import('@seedprotocol/feed');
      expect(handleArchiveFeedRequest).toHaveBeenCalledWith(
        'posts',
        2024,
        3,
        'rss',
        '"abc"',
        undefined
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalled();
    });
  });
});
