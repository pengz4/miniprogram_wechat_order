const { request } = require('../../utils/request');
const { getLoginCode } = require('../../utils/login-code');

Page({
  data: {
    orders: [],
    loading: false,
    errorMessage: ''
  },
  onShow() {
    this.loadOrders();
  },
  goNotify() {
    wx.navigateTo({ url: '/pages/notify/index' });
  },
  onPullDownRefresh() {
    this.loadOrders().then(() => {
      wx.stopPullDownRefresh();
    });
  },
  loadOrders() {
    this.setData({
      loading: true,
      errorMessage: ''
    });

    return getLoginCode()
      .then(code => request({
        url: '/orders',
        header: {
          'X-Wechat-Code': code
        }
      }))
      .then(data => {
        const orders = (data.orders || []).map(order => Object.assign({}, order, {
          remarkText: order.remark || '无',
          notifyStatusText: order.notifyStatusLabel || '未处理'
        }));

        this.setData({
          orders,
          loading: false
        });
      })
      .catch(error => {
        this.setData({
          loading: false,
          errorMessage: error.message || '加载订单失败'
        });
      })
      .then(() => {
        if (wx.stopPullDownRefresh) {
          wx.stopPullDownRefresh();
        }
      });
  }
});
