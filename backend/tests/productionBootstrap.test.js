const http = require('http');
const { createPublicServer } = require('../../productionBootstrap');

function request(server, path) {
  const { port } = server.address();

  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (response) => {
      response.resume();
      response.on('end', () => resolve(response));
    }).on('error', reject);
  });
}

describe('production bootstrap readiness gate', () => {
  let server;

  afterEach(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  test('keeps normal traffic unavailable until the internal API is ready', async () => {
    const proxyServer = { web: jest.fn() };
    server = createPublicServer({
      isApiReady: () => false,
      proxyServer
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const response = await request(server, '/api/dashboard/metrics');

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(proxyServer.web).not.toHaveBeenCalled();
  });

  test('responds to startup probes but proxies traffic after readiness succeeds', async () => {
    let ready = false;
    const proxyServer = {
      web: jest.fn((_req, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ proxied: true }));
      })
    };
    server = createPublicServer({
      isApiReady: () => ready,
      proxyServer
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const startupResponse = await request(server, '/');
    ready = true;
    const proxiedResponse = await request(server, '/api/dashboard/metrics');

    expect(startupResponse.statusCode).toBe(200);
    expect(proxiedResponse.statusCode).toBe(200);
    expect(proxyServer.web).toHaveBeenCalledTimes(1);
  });
});