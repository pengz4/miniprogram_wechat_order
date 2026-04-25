const app = getApp();
const menuData = require('../../data/menu');
const { buildCartItems, summarizeCartItems } = require('../../utils/cart');
const { request } = require('../../utils/request');

function getCartSummary() {
  const cart = app.globalData.cart || {};
  const cartItems = buildCartItems(menuData.items, cart);
  const summary = summarizeCartItems(cartItems);

  return Object.assign({ cartItems }, summary);
}

function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于提交点餐订单',
      success: resolve,
      fail: reject
    });
  });
}

function getErrorMessage(error) {
  if (error && error.message) {
    return error.message;
  }

  if (error && error.errMsg) {
    return error.errMsg;
  }

  return '提交订单失败，请稍后重试';
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatTime(date) {
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function getDefaultReserveTimeParts(now = new Date()) {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);

  if (next.getMinutes() <= 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }

  return {
    reserveDate: formatDate(next),
    reserveTime: formatTime(next)
  };
}

function buildReserveTimeValue(reserveDate, reserveTime) {
  if (!reserveDate || !reserveTime) {
    return '';
  }

  return `${reserveDate} ${reserveTime}`;
}

function getDefaultFormState() {
  return Object.assign({
    remark: '',
    submitting: false
  }, getDefaultReserveTimeParts());
}

Page({
  data: Object.assign({
    cartItems: [],
    totalCount: 0,
    totalPrice: 0
  }, getDefaultFormState()),
  onShow() {
    this.refreshCart();
  },
  refreshCart() {
    this.setData(getCartSummary());
  },
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },
  onReserveDateChange(e) {
    this.setData({ reserveDate: e.detail.value });
  },
  onReserveTimeChange(e) {
    this.setData({ reserveTime: e.detail.value });
  },
  submitOrder() {
    if (!this.data.cartItems.length) {
      wx.showToast({ title: '购物车还是空的', icon: 'none' });
      return;
    }

    if (this.data.submitting) {
      return;
    }

    const reserveTime = buildReserveTimeValue(this.data.reserveDate, this.data.reserveTime);

    if (!reserveTime) {
      wx.showToast({ title: '请选择预约时间', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    getUserProfile()
      .then(profile => {
        const nickname = profile.userInfo && profile.userInfo.nickName;

        if (!nickname) {
          throw new Error('未获取到微信昵称');
        }

        return request({
          url: '/orders',
          method: 'POST',
          data: {
            nickname,
            remark: this.data.remark.trim(),
            reserveTime,
            items: this.data.cartItems.map(item => ({
              id: item.id,
              qty: item.qty
            }))
          }
        }).then(order => ({
          order,
          nickname
        }));
      })
      .then(({ order, nickname }) => {
        app.globalData.cart = {};
        this.setData(getDefaultFormState());
        this.refreshCart();

        wx.showModal({
          title: '提交成功',
          content: `${nickname}，你的点餐已提交，共 ${order.totalCount} 份。`,
          showCancel: false,
          success: () => {
            wx.redirectTo({ url: '/pages/index/index' });
          }
        });
      })
      .catch(error => {
        this.setData({ submitting: false });
        wx.showModal({
          title: '提交失败',
          content: getErrorMessage(error),
          showCancel: false
        });
      });
  }
});
