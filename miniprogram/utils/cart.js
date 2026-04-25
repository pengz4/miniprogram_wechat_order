function countCartItems(cart) {
  return Object.keys(cart).reduce((total, itemId) => total + Number(cart[itemId] || 0), 0);
}

function getItemQuantity(cart, itemId) {
  return Number(cart[itemId] || 0);
}

function buildCartItems(menuItems, cart) {
  return menuItems
    .filter(item => getItemQuantity(cart, item.id) > 0)
    .map(item => {
      const qty = getItemQuantity(cart, item.id);
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        qty,
        subtotal: item.price * qty
      };
    });
}

function summarizeCartItems(cartItems) {
  return cartItems.reduce((summary, item) => {
    summary.totalCount += item.qty;
    summary.totalPrice += item.subtotal;
    return summary;
  }, { totalCount: 0, totalPrice: 0 });
}

module.exports = {
  countCartItems,
  getItemQuantity,
  buildCartItems,
  summarizeCartItems
};
