import net from 'node:net';

/**
 * Minimal in-process SMTP server for tests: speaks enough SMTP (EHLO/HELO, MAIL, RCPT, DATA,
 * RSET, NOOP, QUIT) for nodemailer to deliver to it, and keeps the received messages in
 * memory. Nothing leaves the machine. `failNext = n` answers the next n DATA commands with an
 * error, to test delivery failures.
 */
export async function startSmtpSink() {
  const messages = [];
  const sink = { messages, failNext: 0 };
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let current = { from: null, to: [], data: '' };
    const reply = (line) => socket.write(`${line}\r\n`);
    reply('220 sink.test ESMTP');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (true) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          current.data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          if (sink.failNext > 0) {
            sink.failNext -= 1;
            reply('451 4.3.0 Temporary failure (test)');
          } else {
            messages.push({ ...current, data: current.data.replace(/\r\n\.\./g, '\r\n.') });
            reply('250 2.0.0 Queued');
          }
          current = { from: null, to: [], data: '' };
          continue;
        }
        const nl = buffer.indexOf('\r\n');
        if (nl < 0) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') { socket.write('250-sink.test\r\n250 8BITMIME\r\n'); }
        else if (cmd === 'HELO') reply('250 sink.test');
        else if (cmd === 'MAIL') { current.from = line.slice(10).trim(); reply('250 OK'); }
        else if (cmd === 'RCPT') { current.to.push(line.slice(8).trim()); reply('250 OK'); }
        else if (cmd === 'DATA') { inData = true; reply('354 End data with <CR><LF>.<CR><LF>'); }
        else if (cmd === 'RSET') { current = { from: null, to: [], data: '' }; reply('250 OK'); }
        else if (cmd === 'NOOP') reply('250 OK');
        else if (cmd === 'QUIT') { reply('221 Bye'); socket.end(); return; }
        else reply('502 Not implemented');
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  sink.port = server.address().port;
  sink.close = () => new Promise((resolve) => server.close(resolve));
  return sink;
}
