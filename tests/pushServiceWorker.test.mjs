import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadWorker({ windows = [] } = {}) {
  const handlers = new Map();
  const shown = [];
  const opened = [];
  const scope = {
    location: { origin: 'https://ummet.example' },
    registration: {
      async showNotification(title, options) {
        shown.push({ title, options });
      },
    },
    clients: {
      async matchAll() { return windows; },
      async openWindow(url) { opened.push(url); return { url }; },
    },
    addEventListener(type, handler) { handlers.set(type, handler); },
    skipWaiting() {},
  };
  const source = await readFile(new URL('../public/push-sw.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { self: scope, URL, Promise, console });
  return { handlers, shown, opened };
}

async function dispatch(handler, event) {
  let pending = Promise.resolve();
  handler({
    ...event,
    waitUntil(value) { pending = Promise.resolve(value); },
  });
  await pending;
}

test('shows the exact visible notification payload received from Web Push', async () => {
  const worker = await loadWorker();
  await dispatch(worker.handlers.get('push'), {
    data: {
      json: () => ({
        title: 'جديد اتحاد شباب الأمة: خبر مهم',
        body: 'تم نشر خبر جديد.',
        tag: 'cms:news:n1',
        url: '/?push=news',
        icon: '/icons/union-push-icon.svg',
        badge: '/icons/union-push-badge.svg',
      }),
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(worker.shown)), [{
    title: 'جديد اتحاد شباب الأمة: خبر مهم',
    options: {
      body: 'تم نشر خبر جديد.',
      tag: 'cms:news:n1',
      icon: '/icons/union-push-icon.svg',
      badge: '/icons/union-push-badge.svg',
      data: { url: '/?push=news' },
      dir: 'rtl',
      lang: 'ar',
    },
  }]);
});

test('uses safe Arabic fallbacks for malformed push data', async () => {
  const worker = await loadWorker();
  await dispatch(worker.handlers.get('push'), { data: { json: () => { throw new Error('bad'); } } });
  assert.equal(worker.shown[0].title, 'اتحاد شباب الأمة');
  assert.equal(worker.shown[0].options.body, 'لديك تحديث جديد من الاتحاد.');
  assert.equal(worker.shown[0].options.data.url, '/');
});

test('focuses an existing same-origin window and rejects a cross-origin click URL', async () => {
  const calls = [];
  const existing = {
    url: 'https://ummet.example/',
    async navigate(url) { calls.push(['navigate', url]); this.url = url; },
    async focus() { calls.push(['focus']); },
  };
  const worker = await loadWorker({ windows: [existing] });
  await dispatch(worker.handlers.get('notificationclick'), {
    notification: {
      data: { url: 'https://evil.example/steal' },
      close() { calls.push(['close']); },
    },
  });
  assert.deepEqual(calls, [
    ['close'],
    ['navigate', 'https://ummet.example/'],
    ['focus'],
  ]);
  assert.deepEqual(worker.opened, []);
});

test('opens the allowed internal destination when no site window is open', async () => {
  const worker = await loadWorker();
  await dispatch(worker.handlers.get('notificationclick'), {
    notification: { data: { url: '/?push=gallery' }, close() {} },
  });
  assert.deepEqual(worker.opened, ['https://ummet.example/?push=gallery']);
});

test('opens the accepted student dashboard for personal economy notifications', async () => {
  const worker = await loadWorker();
  await dispatch(worker.handlers.get('notificationclick'), {
    notification: { data: { url: '/?push=student-dashboard' }, close() {} },
  });
  assert.deepEqual(worker.opened, ['https://ummet.example/?push=student-dashboard']);
});
