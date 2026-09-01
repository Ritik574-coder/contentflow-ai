import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { structureDraft, generatePlatformVersions, getSupportedPlatforms, getUnsupportedPlatformReasons } from '../src/contentflow.js';
import { WorkerDbClient } from '../src/db/client.js';
import { approvalKeyboard, parseCallbackData } from '../src/telegram/keyboard.js';

test('structureDraft returns a valid draft object', () => {
  const draft = structureDraft('I wrote a long note about a workflow for creators.');

  assert.equal(typeof draft.title, 'string');
  assert.equal(typeof draft.summary, 'string');
  assert.ok(Array.isArray(draft.tags));
  assert.ok(Array.isArray(draft.keywords));
});

test('enabled platforms exclude Hashnode and X by default', () => {
  const enabled = getSupportedPlatforms();
  const keys = enabled.map((platform) => platform.key);

  assert.ok(keys.includes('blogger'));
  assert.ok(keys.includes('linkedin'));
  assert.ok(keys.includes('devto'));
  assert.ok(!keys.includes('hashnode'));
  assert.ok(!keys.includes('x'));
});

test('platform generation respects unsupported metrics requirements', () => {
  const versions = generatePlatformVersions(structureDraft('This note contains a small sample of future content.'));
  const keys = versions.map((version) => version.platform);

  assert.deepEqual(keys, ['blogger', 'linkedin', 'devto']);
  assert.ok(getUnsupportedPlatformReasons().length >= 3);
});

test('WorkerDbClient normalizes D1 Worker results to query-layer shapes', async () => {
  const prepared = {
    bind() {
      return this;
    },
    async all() {
      return { results: [{ id: 1, status: 'ready_for_review' }], success: true };
    },
    async first() {
      return { id: 1, status: 'ready_for_review' };
    },
    async run() {
      return { success: true, meta: { last_row_id: 7, changes: 1 } };
    },
  };
  const db = new WorkerDbClient({ prepare: () => prepared });

  assert.deepEqual(await db.query('SELECT 1'), [{ id: 1, status: 'ready_for_review' }]);
  assert.deepEqual(await db.first('SELECT 1'), { id: 1, status: 'ready_for_review' });
  assert.deepEqual((await db.run('INSERT')).meta, { last_row_id: 7, changes: 1 });
});

test('approval keyboard includes preview, edit, approve, and reject actions', () => {
  const keyboard = approvalKeyboard(42, [{ key: 'blogger', display_name: 'Blogger' }], []);
  const actions = keyboard.inline_keyboard.flat().map((button) => parseCallbackData(button.callback_data).action);

  assert.ok(actions.includes('toggle'));
  assert.ok(actions.includes('preview'));
  assert.ok(actions.includes('edit'));
  assert.ok(actions.includes('approve'));
  assert.ok(actions.includes('reject'));
});

test('static dashboard can deploy without importing repo source files', async () => {
  const app = await readFile(resolve('site/app.js'), 'utf8');

  assert.equal(app.includes("from '../src/contentflow.js'"), false);
  assert.match(app, /contentId/);
  assert.match(app, /selectedPlatforms/);
});
