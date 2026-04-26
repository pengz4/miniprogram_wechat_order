const test = require('node:test');
const assert = require('node:assert/strict');

const { request } = require('./request');

test('request rejects with message and statusCode for non-2xx responses', async () => {
  global.wx = {
    request(options) {
      options.success({ statusCode: 403, data: { error: '当前微信没有管理员权限。' } });
    }
  };

  try {
    await assert.rejects(
      request({ url: '/wechat/status' }),
      error => error.message === '当前微信没有管理员权限。' && error.statusCode === 403
    );
  } finally {
    delete global.wx;
  }
});
