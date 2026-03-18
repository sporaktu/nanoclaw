#!/usr/bin/env node
import net from 'net';
import path from 'path';
import readline from 'readline';

const STORE_DIR = path.resolve(process.cwd(), 'store');
const SOCK_PATH = path.join(STORE_DIR, 'nanoclaw.sock');

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

let rl: readline.Interface;
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;

function startSpinner(): void {
  if (spinnerTimer) return;
  spinnerFrame = 0;
  spinnerTimer = setInterval(() => {
    process.stdout.write(
      `\r${SPINNER_FRAMES[spinnerFrame++ % SPINNER_FRAMES.length]} Thinking...`,
    );
  }, 80);
}

function stopSpinner(): void {
  if (!spinnerTimer) return;
  clearInterval(spinnerTimer);
  spinnerTimer = null;
  process.stdout.write('\r\x1b[K'); // clear the spinner line
}

function connect(): void {
  const socket = net.connect(SOCK_PATH);
  let lineBuffer = '';

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  socket.on('connect', () => {
    console.log('Connected to NanoClaw.\n');
    rl.prompt();
  });

  socket.on('data', (data) => {
    lineBuffer += data.toString();
    let newlineIdx: number;
    while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, newlineIdx).trim();
      lineBuffer = lineBuffer.slice(newlineIdx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        handleServerMessage(msg);
      } catch {
        // ignore malformed lines
      }
    }
  });

  rl.on('line', (input) => {
    const text = input.trim();
    if (!text) {
      rl.prompt();
      return;
    }
    socket.write(JSON.stringify({ type: 'message', content: text }) + '\n');
  });

  socket.on('close', () => {
    stopSpinner();
    console.log('\nDisconnected. Is the NanoClaw service running?');
    console.log('Start it with: npm run dev');
    rl.close();
    process.exit(0);
  });

  socket.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
      console.error('Cannot connect — NanoClaw service is not running.');
      console.error('Start it with: npm run dev');
    } else {
      console.error('Connection error:', err.message);
    }
    process.exit(1);
  });

  rl.on('close', () => {
    socket.destroy();
    process.exit(0);
  });
}

function handleServerMessage(msg: {
  type: string;
  content?: string;
  value?: boolean;
}): void {
  switch (msg.type) {
    case 'text':
      stopSpinner();
      console.log(`\n${msg.content}\n`);
      rl.prompt();
      break;
    case 'typing':
      if (msg.value) {
        startSpinner();
      } else {
        stopSpinner();
      }
      break;
  }
}

connect();
