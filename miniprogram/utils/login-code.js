function getLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          resolve(res.code);
          return;
        }

        reject(new Error('未获取到登录 code'));
      },
      fail: reject
    });
  });
}

module.exports = {
  getLoginCode
};
