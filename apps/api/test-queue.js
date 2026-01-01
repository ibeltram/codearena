import http from 'http';

// Test queue stats endpoint
const options = {
  hostname: 'localhost',
  port: 3010,
  path: '/api/matches/queue/stats',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('GET /api/matches/queue/stats');
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();
