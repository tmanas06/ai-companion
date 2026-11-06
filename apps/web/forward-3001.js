const http = require('http');
const net = require('net');

const PORT = 3001;
const TARGET_PORT = 3000;

const server = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${TARGET_PORT}` },
  };

  const proxy = http.request(options, (targetRes) => {
    res.writeHead(targetRes.statusCode, targetRes.headers);
    targetRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy forwarding failed', detail: err.message }));
  });

  req.pipe(proxy, { end: true });
});

server.on('upgrade', (req, socket, head) => {
  const target = net.connect(TARGET_PORT, '127.0.0.1', () => {
    target.write(head);
    socket.pipe(target);
    target.pipe(socket);
  });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Forwarding http://localhost:${PORT} -> http://localhost:${TARGET_PORT}`);
});
