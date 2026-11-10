import assert from 'node:assert/strict';

const child = Bun.spawn(
  [
    process.execPath,
    '--bun',
    'next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3100',
  ],
  { stdout: 'inherit', stderr: 'inherit' },
);
try {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 120; attempt++) {
    response = await fetch('http://127.0.0.1:3100').catch(() => undefined);
    if (response) break;
    if (child.exitCode !== null)
      throw new Error(`Next exited: ${child.exitCode}`);
    await Bun.sleep(250);
  }
  assert.equal(response?.status, 200);
  const html = await response.text();
  for (const text of [
    'Hello Ada',
    'Merhaba Ada',
    'Hallo Ada',
    'One item',
    'Many items',
    'Öğeler',
    'Ein Element',
    'Viele Elemente',
    'Mitglied',
    'Administrator',
    'Yönetici',
    '<a href="/guide">the guide</a>',
    '<a href="/guide">Kılavuzu</a>',
    '<a href="/guide">die Anleitung</a>',
  ])
    assert.ok(html.includes(text), `Missing rendered translation: ${text}`);
  console.log(
    'Next/next-intl SSR interpolation, plural/select and rich text passed for en/tr/de.',
  );
} finally {
  child.kill();
  await child.exited;
}
