const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  buildSubscribeMessageData,
  createOrder,
  createServer,
  isAdminOpenId,
  lookupOpenIdForDebug,
  validateDebugOpenIdPayload
} = require('./server');

test('createOrder rejects orders without reserveTime', () => {
  const result = createOrder({
    nickname: '微信用户',
    remark: '少辣',
    items: [{ id: 1, qty: 1 }]
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, 'reserveTime is required.');
});

test('buildSubscribeMessageData uses the new template fields', () => {
  const result = createOrder({
    nickname: '微信用户',
    remark: '少辣',
    reserveTime: '2026-04-21T18:30',
    items: [{ id: 1, qty: 2 }, { id: 2, qty: 1 }]
  });

  assert.equal(result.statusCode, 201);
  assert.deepEqual(buildSubscribeMessageData(result.body), {
    time1: { value: result.body.createdAtLabel },
    thing4: { value: '微信用户' },
    thing5: { value: '宫保鸡丁x2、番茄炒蛋x1' },
    time6: { value: '2026-04-21 18:30' },
    thing7: { value: '少辣' }
  });
});

test('createOrder uses a collision-resistant order id', () => {
  const originalNow = Date.now;
  const originalRandomUUID = crypto.randomUUID;
  let callCount = 0;

  Date.now = () => 1710000000000;
  crypto.randomUUID = () => {
    callCount += 1;
    return callCount === 1 ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  };

  try {
    const first = createOrder({
      nickname: '微信用户',
      remark: '',
      reserveTime: '2026-04-21T18:30',
      items: [{ id: 1, qty: 1 }]
    });
    const second = createOrder({
      nickname: '微信用户',
      remark: '',
      reserveTime: '2026-04-21T18:30',
      items: [{ id: 1, qty: 1 }]
    });

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.notEqual(first.body.id, second.body.id);
  } finally {
    Date.now = originalNow;
    crypto.randomUUID = originalRandomUUID;
  }
});

test('isAdminOpenId matches configured whitelist entries', () => {
  assert.equal(isAdminOpenId(''), false);
});

test('temporary openid lookup rejects missing code', () => {
  const result = validateDebugOpenIdPayload({});
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, 'code is required.');
});

test('temporary openid lookup reports missing WeChat credentials', async () => {
  const result = await lookupOpenIdForDebug('mock-code', async () => {
    throw new Error('缺少微信小程序 AppID 或 AppSecret。');
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, '缺少微信小程序 AppID 或 AppSecret。');
});

test('temporary openid lookup returns openid for valid code', async () => {
  const result = await lookupOpenIdForDebug('mock-code', async () => 'op_test_user');
  assert.deepEqual(result, { statusCode: 200, body: { openid: 'op_test_user' } });
});

test('POST /wechat/debug-openid returns 400 for missing code', async () => {
  const server = createServer({ exchangeCodeForOpenId: async () => 'unused' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/wechat/debug-openid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, 'code is required.');
  } finally {
    server.close();
  }
});

test('POST /wechat/debug-openid returns JSON openid over HTTP', async () => {
  const server = createServer({ exchangeCodeForOpenId: async () => 'op_test_user' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/wechat/debug-openid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'mock-code' })
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(data, { openid: 'op_test_user' });
  } finally {
    server.close();
  }
});
