import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dismissWelcomeMessage,
  readWelcomeMessageDismissed,
  welcomeMessageDismissalKey,
} from '../src/domain/welcomeMessageDismissal.ts';

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
};

const throwingStorage = () => ({
  getItem() {
    throw new Error('storage blocked');
  },
  setItem() {
    throw new Error('storage blocked');
  },
});

test('uses a different accepted-welcome key for each confirmed user', () => {
  assert.equal(welcomeMessageDismissalKey('user-a'), 'welcome_message_dismissed_user-a');
  assert.equal(welcomeMessageDismissalKey('user-b'), 'welcome_message_dismissed_user-b');
});

test('reads only the exact persisted true value and survives storage errors', () => {
  assert.equal(readWelcomeMessageDismissed(memoryStorage({ welcome_message_dismissed_user_a: 'true' }), 'user_a'), true);
  assert.equal(readWelcomeMessageDismissed(memoryStorage({ welcome_message_dismissed_user_a: 'false' }), 'user_a'), false);
  assert.equal(readWelcomeMessageDismissed(throwingStorage(), 'user_a'), false);
});

test('persists dismissal when storage works and reports storage failure safely', () => {
  const storage = memoryStorage();
  assert.equal(dismissWelcomeMessage(storage, 'user_a'), true);
  assert.equal(readWelcomeMessageDismissed(storage, 'user_a'), true);
  assert.equal(dismissWelcomeMessage(throwingStorage(), 'user_a'), false);
});
