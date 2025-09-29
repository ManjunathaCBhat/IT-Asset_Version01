const path = require('path');
const { spawn } = require('child_process');

console.log('🚀 Starting React frontend and Node.js backend from frontend directory...');

// Start Node.js backend server
console.log('📦 Starting Node.js backend server...');
const backend = spawn('npm', ['start'], {
  cwd: path.resolve(__dirname, '../backend'),
  stdio: 'inherit',
  shell: true,
});

// Start React frontend after a delay
setTimeout(() => {
  console.log('⚛️  Starting React frontend server...');
  const frontend = spawn('npm', ['start'], {
    cwd: path.resolve(__dirname),
    stdio: 'inherit',
    shell: true,
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down servers...');
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
    process.exit(0);
  });

  frontend.on('error', (err) => {
    console.error('Frontend error:', err);
  });
}, 3000);

backend.on('error', (err) => {
  console.error('Backend error:', err);
});
