const categories = [
  { id: 'homestyle', name: '家常菜' },
  { id: 'soup', name: '汤类' },
  { id: 'staple', name: '主食' },
  { id: 'drink', name: '饮品' }
];

const items = [
  { id: 1, categoryId: 'homestyle', name: '宫保鸡丁', price: 28, description: '微辣下饭，适合配米饭' },
  { id: 2, categoryId: 'homestyle', name: '番茄炒蛋', price: 18, description: '酸甜开胃，家常常备' },
  { id: 3, categoryId: 'homestyle', name: '青椒土豆丝', price: 12, description: '清爽解腻，适合搭配主菜' },
  { id: 4, categoryId: 'soup', name: '紫菜蛋花汤', price: 10, description: '清淡顺口，适合全家' },
  { id: 5, categoryId: 'soup', name: '番茄牛腩汤', price: 22, description: '汤浓味足，暖胃耐饱' },
  { id: 6, categoryId: 'staple', name: '米饭', price: 2, description: '单人份主食' },
  { id: 7, categoryId: 'staple', name: '扬州炒饭', price: 16, description: '有菜有饭，适合单点' },
  { id: 8, categoryId: 'drink', name: '豆浆', price: 6, description: '热饮，适合早餐或加餐' },
  { id: 9, categoryId: 'drink', name: '酸梅汤', price: 8, description: '冰爽解腻，适合配重口味菜' }
];

function getItemsByCategory(categoryId) {
  return items.filter(item => item.categoryId === categoryId);
}

function findItemById(itemId) {
  return items.find(item => item.id === Number(itemId));
}

module.exports = {
  categories,
  items,
  getItemsByCategory,
  findItemById
};
