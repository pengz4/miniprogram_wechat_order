const { request } = require('../../utils/request');
const { getLoginCode } = require('../../utils/login-code');

function getErrorMessage(error, fallbackText) {
  if (error && error.message) {
    return error.message;
  }

  if (error && error.errMsg) {
    return error.errMsg;
  }

  return fallbackText;
}

function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于绑定订单通知',
      success: resolve,
      fail: reject
    });
  });
}

Page({
  data: {
    loading: false,
    binding: false,
    status: null,
    errorMessage: ''
  },
  onShow() {
    this.loadStatus();
  },
  loadStatus() {
    this.setData({
      loading: true,
      errorMessage: ''
    });

    return getLoginCode()
      .then(code => request({
        url: '/wechat/status',
        header: {
          'X-Wechat-Code': code
        }
      }))
      .then(status => {
        this.setData({
          status,
          loading: false
        });
      })
      .catch(error => {
        this.setData({
          loading: false,
          errorMessage: getErrorMessage(error, '加载通知状态失败')
        });
      });
  },
  bindCurrentUser() {
    if (this.data.binding) {
      return;
    }

    this.setData({ binding: true });

    Promise.all([getUserProfile(), getLoginCode()])
      .then(([profile, code]) => {
        return request({
          url: '/wechat/bind-admin',
          method: 'POST',
          data: {
            code,
            nickname: (profile.userInfo && profile.userInfo.nickName) || ''
          }
        });
      })
      .then(result => {
        this.setData({ binding: false });
        wx.showModal({
          title: '绑定成功',
          content: `当前微信已绑定为通知接收人：${result.nickname}`,
          showCancel: false
        });
        this.loadStatus();
      })
      .catch(error => {
        this.setData({ binding: false });
        wx.showModal({
          title: '绑定失败',
          content: getErrorMessage(error, '请检查后端微信配置'),
          showCancel: false
        });
      });
  },
  requestSubscribe() {
    const status = this.data.status || {};
    const templateId = status.templateId;

    if (!templateId) {
      wx.showModal({
        title: '暂无法订阅',
        content: '后端还没有配置订阅消息模板 ID。',
        showCancel: false
      });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: result => {
        const action = result[templateId];

        if (action === 'accept') {
          wx.showModal({
            title: '订阅成功',
            content: '你已授权下一次新订单提醒。家人下单后，系统会尝试给你发送通知。',
            showCancel: false
          });
          return;
        }

        wx.showModal({
          title: '未订阅',
          content: '你这次没有授权订阅消息，因此新订单不会推送到微信。',
          showCancel: false
        });
      },
      fail: error => {
        wx.showModal({
          title: '订阅失败',
          content: getErrorMessage(error, '请在真机环境下重试'),
          showCancel: false
        });
      }
    });
  }
});
