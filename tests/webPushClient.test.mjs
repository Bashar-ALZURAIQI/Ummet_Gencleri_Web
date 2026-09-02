import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectPushCapability,
  pushDestinationFromUrl,
  serializePushSubscription,
  urlBase64ToUint8Array,
} from '../src/domain/webPushClient.ts';

const supportedInput = {
  isSecureContext: true,
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  notificationPermission: 'default',
  userAgent: 'Mozilla/5.0 Chrome/126',
  platform: 'Win32',
  maxTouchPoints: 0,
  standalone: false,
};

test('reports unsupported when a required browser API is missing', () => {
  assert.deepEqual(
    detectPushCapability({ ...supportedInput, hasPushManager: false }),
    { kind: 'unsupported', reason: 'هذا المتصفح لا يدعم إشعارات الويب.' },
  );
});

test('reports an insecure production context before attempting subscription', () => {
  assert.deepEqual(
    detectPushCapability({ ...supportedInput, isSecureContext: false }),
    { kind: 'unsupported', reason: 'تحتاج الإشعارات إلى اتصال آمن HTTPS.' },
  );
});

test('requires iPhone and iPad users to install the site before enabling push', () => {
  const iphone = detectPushCapability({
    ...supportedInput,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
  });
  const ipadDesktopMode = detectPushCapability({
    ...supportedInput,
    userAgent: 'Mozilla/5.0 Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  });
  assert.equal(iphone.kind, 'ios-install-required');
  assert.equal(ipadDesktopMode.kind, 'ios-install-required');
  assert.equal(detectPushCapability({
    ...supportedInput,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
    standalone: true,
  }).kind, 'ready');
});

test('does not re-prompt after the browser denied notification permission', () => {
  assert.deepEqual(
    detectPushCapability({ ...supportedInput, notificationPermission: 'denied' }),
    {
      kind: 'denied',
      reason: 'تم حظر الإشعارات من إعدادات المتصفح. فعّلها من إعدادات الموقع ثم أعد المحاولة.',
    },
  );
});

test('returns ready for supported default and granted permission states', () => {
  assert.deepEqual(detectPushCapability(supportedInput), { kind: 'ready', permission: 'default' });
  assert.deepEqual(
    detectPushCapability({ ...supportedInput, notificationPermission: 'granted' }),
    { kind: 'ready', permission: 'granted' },
  );
});

test('converts a valid 65-byte VAPID public key and rejects malformed keys', () => {
  const bytes = Uint8Array.from({ length: 65 }, (_, index) => index);
  const key = Buffer.from(bytes).toString('base64url');
  assert.deepEqual([...urlBase64ToUint8Array(key)], [...bytes]);
  assert.throws(() => urlBase64ToUint8Array('not a valid key!'), /VAPID_PUBLIC_KEY_INVALID/);
  assert.throws(() => urlBase64ToUint8Array(Buffer.from([1, 2]).toString('base64url')), /VAPID_PUBLIC_KEY_INVALID/);
});

test('serializes endpoint, expiration and encryption keys exactly as Base64URL', () => {
  const p256dh = Uint8Array.from([250, 251, 252, 253]).buffer;
  const auth = Uint8Array.from([1, 2, 3, 4]).buffer;
  const subscription = {
    endpoint: 'https://push.example.test/subscription/abc',
    expirationTime: 123456,
    getKey(name) {
      return name === 'p256dh' ? p256dh : name === 'auth' ? auth : null;
    },
  };
  assert.deepEqual(serializePushSubscription(subscription), {
    endpoint: 'https://push.example.test/subscription/abc',
    expirationTime: 123456,
    keys: {
      p256dh: Buffer.from(p256dh).toString('base64url'),
      auth: Buffer.from(auth).toString('base64url'),
    },
  });
});

test('refuses subscriptions missing an endpoint or encryption key', () => {
  assert.throws(
    () => serializePushSubscription({ endpoint: '', expirationTime: null, getKey: () => new ArrayBuffer(8) }),
    /PUSH_SUBSCRIPTION_INVALID/,
  );
  assert.throws(
    () => serializePushSubscription({ endpoint: 'https://push.test/a', expirationTime: null, getKey: () => null }),
    /PUSH_SUBSCRIPTION_INVALID/,
  );
});

test('maps only allowlisted push query destinations to existing app views', () => {
  assert.equal(pushDestinationFromUrl('https://site.test/?push=news'), 'news');
  assert.equal(pushDestinationFromUrl('https://site.test/?push=programs'), 'programs');
  assert.equal(pushDestinationFromUrl('https://site.test/?push=gallery'), 'gallery');
  assert.equal(pushDestinationFromUrl('https://site.test/?push=admin'), null);
  assert.equal(pushDestinationFromUrl('not a url'), null);
});
