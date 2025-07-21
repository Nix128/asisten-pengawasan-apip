// index.js (Ini hanya untuk Replit agar tidak kosong dan bisa dijalankan)
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AI Assistant Server is Running (Locally in Replit)! This is just a placeholder.\n');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('Open your browser to: http://localhost:' + PORT);
  console.log('For the actual AI functions, they will be deployed as Netlify Functions.');
});
