const app = getApp();
const menuData = require('../../data/menu');
const { countCartItems, getItemQuantity } = require('../../utils/cart');

function getDefaultCategoryId() {
  return menuData.categories.length ? menuData.categories[0].id : '';
}

function buildVisibleItems(categoryId, cart) {
  return menuData.getItemsByCategory(categoryId).map(item => ({
    id: item.id,
    name: item.name,
    price: item.price,
    description: item.description,
    quantity: getItemQuantity(cart, item.id)
  }));
}

Page({
  data: {
    categories: menuData.categories,
    currentCategoryId: getDefaultCategoryId(),
    visibleItems: [],
    cart: {},
    cartCount: 0
  },
  onShow() {
    this.syncPageData();
  },
  syncPageData() {
    const cart = app.globalData.cart || {};
    const currentCategoryId = this.data.currentCategoryId || getDefaultCategoryId();

    this.setData({
      cart,
      cartCount: countCartItems(cart),
      currentCategoryId,
      visibleItems: buildVisibleItems(currentCategoryId, cart)
    });
  },
  switchCategory(e) {
    const currentCategoryId = e.currentTarget.dataset.id;
    const cart = app.globalData.cart || {};

    this.setData({
      currentCategoryId,
      visibleItems: buildVisibleItems(currentCategoryId, cart)
    });
  },
  addToCart(e) {
    const id = e.currentTarget.dataset.id;
    const cart = Object.assign({}, app.globalData.cart || {});

    cart[id] = getItemQuantity(cart, id) + 1;
    app.globalData.cart = cart;
    this.syncPageData();
  },
  decreaseFromCart(e) {
    const id = e.currentTarget.dataset.id;
    const cart = Object.assign({}, app.globalData.cart || {});
    const nextQuantity = Math.max(getItemQuantity(cart, id) - 1, 0);

    if (nextQuantity > 0) {
      cart[id] = nextQuantity;
    } else {
      delete cart[id];
    }

    app.globalData.cart = cart;
    this.syncPageData();
  },
  goOrder() {
    if (!this.data.cartCount) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' });
      return;
    }

    wx.navigateTo({ url: '/pages/order/index' });
  },
  goOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  }
});
