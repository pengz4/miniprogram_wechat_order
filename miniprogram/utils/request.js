const config = require('../config');

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header: Object.assign({
        'Content-Type': 'application/json'
      }, options.header || {}),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        const error = new Error((res.data && res.data.error) || '请求失败');
        error.statusCode = res.statusCode;
        reject(error);
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

module.exports = {
  request
};
