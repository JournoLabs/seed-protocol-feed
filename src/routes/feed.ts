import { handleFeedRequest } from '../index';
import type { ApiHandler } from '../types';

export const getFeed: ApiHandler = async (req, res) => {
  const { schemaName, format } = req.params;
  console.log(`Getting feed for schema: ${schemaName} and format: ${format}`);
  const response = await handleFeedRequest(schemaName, format);

  res.status(response.status)
  response.headers.forEach((value, key) => res.set(key, value))
  res.send(await response.text())
}