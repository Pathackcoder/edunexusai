import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Portal chat: entry points, the realtime client and what it sends. */
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('portal chat', () => {
  it('the profile drawer offers Chat to the left of Call, keeping Call and Email', () => {
    const drawer = read('components/directory/PersonProfileDrawer.jsx');
    const chat = drawer.indexOf('>\n                Chat\n');
    const call = drawer.indexOf('Call\n');
    const email = drawer.indexOf('href={`mailto:${p.email}`}>');
    assert.ok(chat > 0 && call > chat && email > call, 'Chat, then Call, then Email');
    assert.match(drawer, /href=\{`tel:\$\{p\.phone\.replace/);
    assert.match(drawer, /p\.canMessage \?/);
    assert.match(drawer, /onClose\(\); chat\.openWithProfile\(p\.profileId\)/, 'the profile drawer closes: no drawer on a drawer');
  });

  it('the header shows the real unread count and opens the inbox', () => {
    const header = read('layouts/Header.jsx');
    assert.match(header, /const chatUnread = chat\?\.unreadTotal \?\? 0;/);
    assert.match(header, /badgeContent=\{chatUnread\} max=\{99\} invisible=\{!chatUnread\}/);
    assert.match(header, /onClick=\{chat\.openInbox\}/);
  });

  it('the socket presents the portal session token and never a sender id', () => {
    const context = read('context/ChatContext.jsx');
    assert.match(context, /auth: \(cb\) => cb\(\{ token: tokenStore\.getAccessToken\(\) \}\)/);
    assert.match(context, /emit\('chat:send', \{ conversationId, body: pending\.body, clientId: pending\.clientId \}/);
    assert.doesNotMatch(context, /emit\('chat:send', \{[^}]*senderId/);
    assert.match(context, /error\?\.data\?\.code === 'TOKEN_EXPIRED'\) reconnectFresh\(\)/);
    assert.match(context, /socket\.removeAllListeners\(\);\s+socket\.disconnect\(\);/, 'cleaned up on sign-out / unmount');
  });

  it('Enter sends, Shift+Enter adds a line', () => {
    assert.match(read('components/chat/ChatPanel.jsx'), /if \(e\.key === 'Enter' && !e\.shiftKey && !e\.nativeEvent\.isComposing\)/);
  });

  it('the dev server proxies the realtime socket to the API', () => {
    assert.match(readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8'), /'\/socket\.io': \{[^}]*ws: true/);
  });
});
