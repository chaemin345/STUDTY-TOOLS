'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeStudySnapshot } = require('../lib/server/integrations');

test('snapshot sanitizer removes non-record data and caps fields', () => {
  const safe = sanitizeStudySnapshot({
    examName: 'A'.repeat(100),
    examDate: '2026-02-31',
    dailyGoal: 99999,
    subjects: ['Physics', 42, '<script>', 'Physics'],
    sessions: [
      { date: '2026-11-17', subject: 'B'.repeat(100), minutes: 9999, kind: 'invalid', ignored: 'drop' },
      { date: 'not-a-date', subject: {}, minutes: -3 },
      null,
    ],
    tasks: [
      { title: 'T'.repeat(200), subject: 'Chemistry', date: '2026-11-17', priority: 'unexpected', done: 'true', extra: 'drop' },
      { title: {}, priority: 'high' },
    ],
    memory: ['M'.repeat(600), 1],
  });

  assert.equal(safe.examName.length, 50);
  assert.equal(safe.examDate, '');
  assert.equal(safe.dailyGoal, 1440);
  assert.deepEqual(safe.subjects, ['Physics', '<script>']);
  assert.equal(safe.sessions.length, 1);
  assert.equal(safe.sessions[0].subject.length, 40);
  assert.equal(safe.sessions[0].minutes, 1440);
  assert.equal(safe.sessions[0].kind, 'focus');
  assert.equal(safe.tasks.length, 1);
  assert.equal(safe.tasks[0].title.length, 120);
  assert.equal(safe.tasks[0].priority, 'normal');
  assert.equal(safe.tasks[0].done, false);
  assert.equal(safe.memory[0].length, 500);
  assert.equal(Object.hasOwn(safe.tasks[0], 'extra'), false);
});

test('snapshot sanitizer respects collection limits and zero memory limit', () => {
  const snapshot = {
    sessions: Array.from({ length: 140 }, (_, i) => ({ subject: 'Math', minutes: 25, date: '2026-11-17', id: i })),
    tasks: Array.from({ length: 90 }, (_, i) => ({ title: String(i) })),
    memory: ['keep out'],
  };
  const safe = sanitizeStudySnapshot(snapshot, { sessionLimit: 10, taskLimit: 5, memoryLimit: 0 });
  assert.equal(safe.sessions.length, 10);
  assert.equal(safe.tasks.length, 5);
  assert.deepEqual(safe.memory, []);
});
