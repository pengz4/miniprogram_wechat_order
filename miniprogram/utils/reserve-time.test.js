const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReserveTimeValue, getDefaultReserveTimeParts } = require('./reserve-time');

test('getDefaultReserveTimeParts rounds up to the next half hour', () => {
  const parts = getDefaultReserveTimeParts(new Date('2026-04-21T14:10:00'));

  assert.deepEqual(parts, {
    reserveDate: '2026-04-21',
    reserveTime: '14:30'
  });
});

test('buildReserveTimeValue joins the selected date and time', () => {
  assert.equal(buildReserveTimeValue('2026-04-21', '18:30'), '2026-04-21 18:30');
});
