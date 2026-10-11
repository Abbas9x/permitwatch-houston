import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('API failure handling', () => {
  it('does not issue a request with an already-cancelled signal', async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));
    vi.stubGlobal('fetch',fetcher);
    const controller=new AbortController();controller.abort();
    await expect(apiRequest('/api/health',{signal:controller.signal})).rejects.toMatchObject({code:'aborted'});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a successful response containing malformed JSON instead of crashing the consumer', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>proxy error</html>',{status:200})));
    await expect(apiRequest('/api/search')).rejects.toMatchObject({code:'invalid_response'});
  });
});
