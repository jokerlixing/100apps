'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PUBLIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/shop-core.js': ['shop-core.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
});

function sendText(response, statusCode, text, headers = {}) {
  const content = Buffer.from(text, 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': content.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(content);
}

function serveFile(request, response, definition) {
  const [filename, contentType] = definition;
  fs.readFile(path.join(__dirname, filename), (error, content) => {
    if (error) {
      sendText(response, 404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  });
}

function createShopServer() {
  return http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      sendText(response, 400, 'Bad request');
      return;
    }
    const definition = PUBLIC_FILES[pathname];
    if (!definition) {
      sendText(response, 404, 'Not found');
      return;
    }
    serveFile(request, response, definition);
  });
}

module.exports = Object.freeze({ PUBLIC_FILES, createShopServer });

if (require.main === module) {
  const requestedPort = Number(process.env.PORT);
  const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 4182;
  createShopServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`云岫山货铺 listening on http://127.0.0.1:${port}\n`);
  });
}
