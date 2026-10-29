import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, getTestServer, login } from './helpers/testEnv.js';
import { startCmsStub } from './helpers/cmsStub.js';
import { startSmtpSink } from './helpers/smtpSink.js';
import { resetMailer } from '../src/modules/cms/mailer.js';
import { sanitizeRichHtml } from '../src/modules/cms/richHtml.js';
import { parseVideoUrl, videoEmbedUrl } from '../../shared/video.js';
import { validateFormDefinition, validateSubmission } from '../../shared/forms.js';

/**
 * Scheduled publishing (backend side), rich-text sanitising, video validation and custom forms
 * with email notifications. The CMS is the in-process stub and mail goes to an in-process SMTP
 * sink; nothing leaves the machine. The CMS-side scheduler (cron) is verified separately
 * against the real CMS (see STRAPI_CMS_IMPLEMENTATION.md §13).
 */
const TOKEN = 'stub-cms-token-features-0123456789';
let stub;
let sink;
let tokens;
const ALL = { students: true, faculty: true, staff: true };
const STAFF = { students: false, faculty: false, staff: true };
const fields = [
  { id: 'a', type: 'text', label: 'Full Name', name: 'full_name', required: true },
  { id: 'b', type: 'email', label: 'Email Address', name: 'email', required: true },
  { id: 'c', type: 'select', label: 'Resource Category', name: 'category', required: true, options: [{ label: 'Academic Support', value: 'Academic Support' }, { label: 'Career Services', value: 'Career Services' }] },
  { id: 'd', type: 'checkboxes', label: 'Topics', name: 'topics', options: [{ label: 'One', value: 'One' }, { label: 'Two', value: 'Two' }] },
  { id: 'e', type: 'textarea', label: 'Description', name: 'description' },
];
const valid = { full_name: 'Test Person', email: 'test.person@example.test', category: 'Career Services', topics: ['Two'], description: '<script>x</script> & more' };

before(async () => {
  await getTestServer();
  stub = await startCmsStub({ token: TOKEN });
  sink = await startSmtpSink();
  Object.assign(process.env, { CMS_URL: stub.url, CMS_API_TOKEN: TOKEN, CMS_TIMEOUT_MS: '2000' });
  tokens = { admin: await login('admin'), student: await login('student'), faculty: await login('faculty') };
});
after(async () => {
  for (const key of ['CMS_URL', 'CMS_API_TOKEN', 'SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM', 'SMTP_SECURE']) process.env[key] = '';
  resetMailer();
  await sink?.close();
  await stub?.close();
  await closeTestServer();
});

const useMail = (on) => {
  if (on) Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(sink.port), SMTP_SECURE: 'false', MAIL_FROM: 'EduNexusAI Forms <no-reply@feddrick.test>' });
  else Object.assign(process.env, { SMTP_HOST: '', MAIL_FROM: '' });
  resetMailer();
};

async function publishedForm(body = {}) {
  const created = await api('/studio/form', { method: 'POST', token: tokens.admin, body: { name: 'Student Resource Request', description: 'd', fields, audiences: ALL, ...body } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  await api(`/studio/form/${created.body.data.id}/publish`, { method: 'POST', token: tokens.admin });
  return created.body.data.id;
}

describe('shared validators', () => {
  it('video URLs: YouTube/Vimeo formats accepted, everything else rejected, embed built from the id', () => {
    for (const url of ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'https://youtu.be/aqz-KE-bpKQ?t=30', 'https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 'https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871', 'https://vimeo.com/76979871/abcdef1234']) assert.ok(parseVideoUrl(url), url);
    for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ', 'https://www.youtube.com/watch?v=short', 'https://vimeo.com/channels/staffpicks', '<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ">', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ" onload="x', 'ftp://youtube.com/watch?v=aqz-KE-bpKQ']) assert.equal(parseVideoUrl(url), null, url);
    assert.equal(videoEmbedUrl(parseVideoUrl('https://youtu.be/aqz-KE-bpKQ?t=1m5s')), 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0&start=65');
    assert.equal(videoEmbedUrl(parseVideoUrl('https://vimeo.com/76979871/abcdef1234')), 'https://player.vimeo.com/video/76979871?dnt=1&h=abcdef1234');
  });

  it('rich HTML: scripts, handlers, unsafe URLs and unsupported tags removed; formatting kept', () => {
    const out = sanitizeRichHtml('<h2 style="text-align:center;color:red">T</h2><p onclick="x">a <strong>b</strong> <a href="javascript:x">j</a> <a href="https://x.edu" target="_blank">e</a></p><script>alert(1)</script><iframe src="https://evil"></iframe><img src="http://evil/x.png"><img src="/api/v1/content/media/a.png" alt="A" onerror="x">');
    assert.equal(out, '<h2 style="text-align:center">T</h2><p>a <strong>b</strong> <a>j</a> <a href="https://x.edu" target="_blank" rel="noopener noreferrer">e</a></p><img src="/api/v1/content/media/a.png" alt="A" />');
  });

  it('form definitions and submissions', () => {
    assert.equal(validateFormDefinition({ name: 'x', fields: [{ type: 'text', label: 'A', name: 'a' }, { type: 'text', label: 'B', name: 'a' }] }).ok, false, 'duplicate names');
    assert.equal(validateFormDefinition({ name: 'x', fields: [{ type: 'script', label: 'A', name: 'a' }] }).ok, false, 'unknown type');
    assert.equal(validateFormDefinition({ name: 'x', fields, recipientEmail: 'a@other.edu' }, { recipientDomains: ['feddrick.edu'] }).ok, false, 'recipient domain policy');
    const def = validateFormDefinition({ name: 'x', fields }).form;
    assert.equal(validateSubmission(def.fields, valid).ok, true);
    assert.equal(validateSubmission(def.fields, { ...valid, topics: ['Three'] }).ok, false);
    assert.equal(validateSubmission(def.fields, { ...valid, full_name: 'x'.repeat(501) }).ok, false);
  });
});

describe('scheduled publishing (backend)', () => {
  let pageId;
  before(async () => {
    const page = await api('/studio/page', { method: 'POST', token: tokens.admin, body: { title: 'Sched', slug: 'sched', audiences: ALL, layout: { root: { props: {} }, content: [] } } });
    pageId = page.body.data.id;
  });
  it('only administrators can read or change schedules', async () => {
    for (const who of ['student', 'faculty']) {
      assert.equal((await api(`/studio/page/${pageId}/schedule`, { token: tokens[who] })).status, 403);
      assert.equal((await api(`/studio/page/${pageId}/schedule`, { method: 'PUT', token: tokens[who], body: { publishAt: new Date(Date.now() + 3600_000).toISOString() } })).status, 403);
    }
  });
  it('validates input, passes the session tenant, and shows the Scheduled state', async () => {
    assert.equal((await api(`/studio/page/${pageId}/schedule`, { method: 'PUT', token: tokens.admin, body: {} })).status, 400);
    assert.equal((await api(`/studio/page/${pageId}/schedule`, { method: 'PUT', token: tokens.admin, body: { publishAt: 'tomorrow' } })).status, 400);
    assert.equal((await api('/studio/form/abcdefghij0123456789abcd/schedule', { token: tokens.admin })).status, 400, 'forms are not schedulable');
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await api(`/studio/page/${pageId}/schedule`, { method: 'PUT', token: tokens.admin, body: { publishAt: at, tenant: 'another-university' } });
    assert.equal(res.status, 200);
    const call = [...stub.requests].reverse().find((r) => r.method === 'PUT' && r.path.endsWith('/schedule'));
    assert.equal(call.body.tenant !== 'another-university', true);
    assert.equal(call.body.publishAt, at);
    const listed = (await api('/studio/page', { token: tokens.admin })).body.data.find((p) => p.id === pageId);
    assert.equal(listed.state, 'scheduled');
    assert.equal(listed.schedule.publish.runAt, at);
    assert.equal((await api('/content/pages/sched', { token: tokens.student })).status, 404, 'not delivered before publication');
  });
  it('the CMS rejection of a past time is passed through', async () => {
    assert.equal((await api(`/studio/page/${pageId}/schedule`, { method: 'PUT', token: tokens.admin, body: { publishAt: new Date(Date.now() - 1000).toISOString() } })).status, 400);
  });
});

describe('rich text on news and pages', () => {
  it('HTML is sanitized on save and again on delivery', async () => {
    const res = await api('/studio/announcement', { method: 'POST', token: tokens.admin, body: { title: 'HTML', bodyFormat: 'html', body: '<p onclick="x">Hi<script>alert(1)</script></p>', audiences: ALL } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.body, '<p>Hi</p>');
    await api(`/studio/announcement/${res.body.data.id}/publish`, { method: 'POST', token: tokens.admin });
    // Tamper with the stored copy directly in the CMS: delivery must still be safe.
    const doc = stub.docs.get(res.body.data.id);
    doc.published.body = '<p>Hi</p><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>';
    const live = (await api('/content/announcements', { token: tokens.student })).body.data.find((a) => a.title === 'HTML');
    assert.equal(live.body, '<p>Hi</p><a>x</a>');
    assert.equal(live.bodyFormat, 'html');
  });
  it('page rich-text blocks are sanitized; video blocks keep only validated URLs', async () => {
    const res = await api('/studio/page', { method: 'POST', token: tokens.admin, body: { title: 'Rich', slug: 'rich', audiences: ALL, layout: { root: { props: {} }, content: [{ type: 'RichText', props: { id: 'r', format: 'html', html: '<p style="text-align:right">x<script>1</script></p>' } }, { type: 'Video', props: { id: 'v', url: 'https://youtu.be/aqz-KE-bpKQ' } }] } } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.layout.content[0].props.html, '<p style="text-align:right">x</p>');
    assert.equal(res.body.data.layout.content[1].props.url, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    const bad = await api('/studio/page', { method: 'POST', token: tokens.admin, body: { title: 'Bad', slug: 'bad-video', audiences: ALL, layout: { root: { props: {} }, content: [{ type: 'Video', props: { id: 'v', url: '<iframe src="https://evil.example">' } }] } } });
    assert.equal(bad.status, 400);
  });
});

describe('custom forms', () => {
  it('only administrators can create forms, change recipients or run test submissions', async () => {
    for (const who of ['student', 'faculty']) {
      assert.equal((await api('/studio/form', { method: 'POST', token: tokens[who], body: { name: 'x', fields, audiences: ALL } })).status, 403);
      assert.equal((await api('/studio/form', { token: tokens[who] })).status, 403);
    }
    const bad = await api('/studio/form', { method: 'POST', token: tokens.admin, body: { name: 'x', fields, recipientEmail: 'nope', audiences: ALL } });
    assert.equal(bad.status, 400);
  });

  it('delivers the published definition to its audience only, never the recipient', async () => {
    const id = await publishedForm({ recipientEmail: 'forms@feddrick.test', audiences: STAFF });
    const admin = await api(`/content/forms/${id}`, { token: tokens.admin });
    assert.equal(admin.status, 200);
    assert.equal('recipientEmail' in admin.body.data, false);
    assert.equal('notificationSubject' in admin.body.data, false);
    assert.equal((await api(`/content/forms/${id}`, { token: tokens.student })).status, 404);
    assert.equal((await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid } })).status, 404);
    const foreign = stub.seed('form', 'another-university', { name: 'Foreign', fields, recipientEmail: 'x@y.test', audienceStudents: true, audienceFaculty: true, audienceStaff: true });
    assert.equal((await api(`/content/forms/${foreign}`, { token: tokens.student })).status, 404, 'other tenant');
    assert.equal((await api(`/content/forms/${foreign}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid } })).status, 404);
    assert.equal((await api(`/content/forms/${id}`)).status, 401, 'sign-in required');
  });

  it('validates submissions on the server against the published definition', async () => {
    useMail(false);
    const id = await publishedForm({ recipientEmail: 'forms@feddrick.test' });
    const missing = await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: { email: 'bad' } } });
    assert.equal(missing.status, 400);
    assert.deepEqual(Object.keys(missing.body.error.details.fieldErrors).sort(), ['category', 'email', 'full_name']);
    assert.equal((await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: { ...valid, extra: 'x' } } })).status, 400);
    assert.equal((await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid, recipientEmail: 'attacker@evil.test' } })).status, 400, 'no extra top-level keys');
    // A draft change does not affect submissions until it is published.
    await api(`/studio/form/${id}`, { method: 'PUT', token: tokens.admin, body: { name: 'Student Resource Request', fields: [fields[0]], recipientEmail: 'forms@feddrick.test', audiences: ALL } });
    assert.equal((await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: { full_name: 'Only name' } } })).status, 400, 'still the published definition');
  });

  it('refuses honestly when email or the recipient is not configured', async () => {
    useMail(false);
    const noRecipient = await publishedForm();
    const r1 = await api(`/content/forms/${noRecipient}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid } });
    assert.equal(r1.status, 503);
    assert.equal(r1.body.error.code, 'FORM_NOT_CONFIGURED');
    const id = await publishedForm({ recipientEmail: 'forms@feddrick.test' });
    const r2 = await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid } });
    assert.equal(r2.status, 503);
    assert.equal(r2.body.error.code, 'MAIL_NOT_CONFIGURED');
    const meta = await api('/studio/meta', { token: tokens.admin });
    assert.equal(meta.body.data.mail.configured, false);
    assert.equal(meta.body.data.timezone, 'America/New_York');
    const test = await api(`/studio/form/${id}/test-submission`, { method: 'POST', token: tokens.admin, body: { values: valid } });
    assert.deepEqual([test.body.data.valid, test.body.data.sent, test.body.data.mail.configured], [true, false, false]);
  });

  it('emails a valid submission to the configured recipient (SMTP), escaping the content', async () => {
    useMail(true);
    const id = await publishedForm({ recipientEmail: 'forms@feddrick.test', notificationSubject: 'Resource request' });
    const before = sink.messages.length;
    const res = await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.delivered, true);
    assert.equal(sink.messages.length, before + 1);
    const mail = sink.messages.at(-1);
    assert.deepEqual(mail.to, ['<forms@feddrick.test>']);
    assert.match(mail.data, /Subject: Resource request/);
    assert.match(mail.data, /Reply-To: test\.person@example\.test/);
    // Decode the quoted-printable HTML part and check that submitted text is escaped there.
    const htmlPart = mail.data.split(/----_NmP[^\r\n]*/).find((p) => /Content-Type: text\/html/.test(p)) ?? '';
    const decoded = htmlPart.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    assert.match(decoded, /&lt;script&gt;x&lt;\/script&gt; &amp; more/, 'HTML part escaped');
    assert.doesNotMatch(decoded, /<script>/);
    const meta = await api('/studio/meta', { token: tokens.admin });
    assert.equal(meta.body.data.mail.configured, true);
    assert.equal(meta.body.data.mail.verified, true);
    assert.equal(JSON.stringify(meta.body).includes(String(sink.port)), false, 'no SMTP details exposed');
  });

  it('reports a mail failure instead of claiming success, and discards honeypot submissions silently', async () => {
    useMail(true);
    const id = await publishedForm({ recipientEmail: 'forms@feddrick.test' });
    sink.failNext = 1;
    const failed = await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid } });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error.code, 'MAIL_FAILED');
    const before = sink.messages.length;
    const spam = await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: valid, website: 'http://spam' } });
    assert.equal(spam.status, 200);
    assert.equal(spam.body.data.delivered, false);
    assert.equal(sink.messages.length, before, 'nothing sent');
  });

  it('rejects oversized submissions', async () => {
    const id = await publishedForm({ recipientEmail: 'forms@feddrick.test' });
    const res = await api(`/content/forms/${id}/submissions`, { method: 'POST', token: tokens.student, body: { values: { ...valid, description: 'x'.repeat(60_000) } } });
    assert.equal(res.status, 413);
  });
});
