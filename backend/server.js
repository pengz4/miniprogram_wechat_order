const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const { init, isDatabaseConfigured, OrderRecord, WeChatAdminBinding } = require('../db');
const { categories, items, findItemById } = require('../miniprogram/data/menu');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const ordersFile = path.join(__dirname, 'data', 'orders.json');
const wechatAdminFile = path.join(__dirname, 'data', 'wechat-admin.json');
const wechatConfig = {
  appId: String(process.env.WECHAT_APP_ID || '').trim(),
  appSecret: String(process.env.WECHAT_APP_SECRET || '').trim(),
  templateId: String(process.env.WECHAT_NOTIFY_TEMPLATE_ID || '').trim(),
  adminOpenIds: String(process.env.WECHAT_ADMIN_OPENIDS || '').split(',').map(item => item.trim()).filter(Boolean),
  page: String(process.env.WECHAT_NOTIFY_PAGE || 'pages/orders/index').trim(),
  fields: {
    orderer: String(process.env.WECHAT_NOTIFY_FIELD_ORDERER || 'thing4').trim(),
    dishes: String(process.env.WECHAT_NOTIFY_FIELD_DISHES || 'thing5').trim(),
    remark: String(process.env.WECHAT_NOTIFY_FIELD_REMARK || 'thing7').trim(),
    time: String(process.env.WECHAT_NOTIFY_FIELD_TIME || 'time1').trim(),
    reserveTime: String(process.env.WECHAT_NOTIFY_FIELD_RESERVE_TIME || 'time6').trim()
  }
};
let accessTokenCache = {
  value: '',
  expiresAt: 0
};

ensureStorageFile(ordersFile, '[]\n');
ensureStorageFile(wechatAdminFile, '{}\n');

function ensureStorageFile(filePath, initialValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, initialValue, 'utf8');
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end(body);
}

function loadOrdersFromFile() {
  const orders = loadJsonFile(ordersFile, []);

  if (!Array.isArray(orders)) {
    throw new Error('Orders storage is invalid.');
  }

  return orders;
}

function saveOrdersToFile(orders) {
  fs.writeFileSync(ordersFile, `${JSON.stringify(orders, null, 2)}\n`, 'utf8');
}

function loadJsonFile(filePath, fallbackValue) {
  const raw = fs.readFileSync(filePath, 'utf8');

  if (!raw.trim()) {
    return fallbackValue;
  }

  return JSON.parse(raw);
}

function loadWeChatAdminBindingFromFile() {
  const binding = loadJsonFile(wechatAdminFile, {});

  if (binding && typeof binding === 'object' && !Array.isArray(binding)) {
    return binding;
  }

  throw new Error('WeChat admin storage is invalid.');
}

function saveWeChatAdminBindingToFile(binding) {
  fs.writeFileSync(wechatAdminFile, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
}

function parseStoredOrder(record) {
  return JSON.parse(record.payload);
}

async function loadOrders() {
  if (!isDatabaseConfigured) {
    return loadOrdersFromFile();
  }

  const records = await OrderRecord.findAll({
    order: [['createdAtSort', 'DESC']]
  });

  return records.map(parseStoredOrder);
}

async function saveOrder(order) {
  if (!isDatabaseConfigured) {
    const orders = loadOrdersFromFile();
    orders.unshift(order);
    saveOrdersToFile(orders);
    return;
  }

  await OrderRecord.upsert({
    id: order.id,
    createdAtSort: order.createdAt,
    payload: JSON.stringify(order)
  });
}

async function loadWeChatAdminBinding() {
  if (!isDatabaseConfigured) {
    return loadWeChatAdminBindingFromFile();
  }

  const binding = await WeChatAdminBinding.findByPk(1);
  return binding ? binding.toJSON() : {};
}

async function saveWeChatAdminBinding(binding) {
  if (!isDatabaseConfigured) {
    saveWeChatAdminBindingToFile(binding);
    return;
  }

  await WeChatAdminBinding.upsert({
    id: 1,
    openid: binding.openid || '',
    nickname: binding.nickname || '',
    lastBoundAt: binding.lastBoundAt || ''
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();

      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeReserveTime(value) {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return '';
  }

  const match = normalizedValue.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);

  if (!match) {
    return '';
  }

  const [, datePart, timePart] = match;
  return `${datePart} ${timePart}`;
}

function validateDebugOpenIdPayload(payload) {
  const code = String((payload && payload.code) || '').trim();

  if (!code) {
    return { statusCode: 400, body: { error: 'code is required.' } };
  }

  return { statusCode: 200, body: { code } };
}

async function lookupOpenIdForDebug(code, exchangeFn = exchangeCodeForOpenId) {
  try {
    const openid = await exchangeFn(code);
    return { statusCode: 200, body: { openid } };
  } catch (error) {
    if (error && error.message === '缺少微信小程序 AppID 或 AppSecret。') {
      return { statusCode: 400, body: { error: error.message } };
    }

    throw error;
  }
}

function getMaskedOpenId(openid) {
  if (!openid) {
    return '';
  }

  if (openid.length <= 10) {
    return openid;
  }

  return `${openid.slice(0, 6)}...${openid.slice(-4)}`;
}

function trimText(text, maxLength) {
  const normalizedText = String(text || '').trim();

  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength - 1)}…`;
}

function hasAdminWhitelist() {
  return wechatConfig.adminOpenIds.length > 0;
}

function isAdminOpenId(openid) {
  return wechatConfig.adminOpenIds.includes(String(openid || '').trim());
}

async function authorizeAdminCode(code) {
  if (!wechatConfig.appId || !wechatConfig.appSecret) {
    return { statusCode: 400, body: { error: '缺少 WECHAT_APP_ID 或 WECHAT_APP_SECRET，暂时无法校验管理员身份。' } };
  }

  if (!hasAdminWhitelist()) {
    return { statusCode: 403, body: { error: '后端未配置管理员 OpenID 白名单。' } };
  }

  if (!code) {
    return { statusCode: 400, body: { error: '缺少管理员登录 code。' } };
  }

  const openid = await exchangeCodeForOpenId(code);

  if (!isAdminOpenId(openid)) {
    return { statusCode: 403, body: { error: '当前微信没有管理员权限。' } };
  }

  return {
    statusCode: 200,
    body: { openid }
  };
}

async function getWeChatStatus() {
  const binding = await loadWeChatAdminBinding();
  const adminBound = Boolean(binding.openid && (!hasAdminWhitelist() || isAdminOpenId(binding.openid)));
  const missingConfig = [];

  if (!wechatConfig.appId) {
    missingConfig.push('WECHAT_APP_ID');
  }

  if (!wechatConfig.appSecret) {
    missingConfig.push('WECHAT_APP_SECRET');
  }

  if (!wechatConfig.templateId) {
    missingConfig.push('WECHAT_NOTIFY_TEMPLATE_ID');
  }

  return {
    credentialsReady: Boolean(wechatConfig.appId && wechatConfig.appSecret),
    adminWhitelistReady: hasAdminWhitelist(),
    templateReady: Boolean(wechatConfig.templateId),
    notificationsReady: Boolean(wechatConfig.appId && wechatConfig.appSecret && wechatConfig.templateId),
    credentialsText: wechatConfig.appId && wechatConfig.appSecret ? '已配置' : '未配置',
    credentialsClassName: wechatConfig.appId && wechatConfig.appSecret ? 'ok' : 'warn',
    templateText: wechatConfig.templateId ? '已配置' : '未配置',
    templateClassName: wechatConfig.templateId ? 'ok' : 'warn',
    templateId: wechatConfig.templateId || '',
    notifyPage: wechatConfig.page,
    adminWhitelistCount: wechatConfig.adminOpenIds.length,
    adminBound,
    adminNickname: adminBound ? (binding.nickname || '管理员') : '未绑定',
    adminClassName: adminBound ? 'ok' : 'warn',
    adminOpenIdMasked: adminBound ? getMaskedOpenId(binding.openid) : '',
    lastBoundAt: binding.lastBoundAt || '',
    lastBoundAtLabel: binding.lastBoundAt ? formatDateTime(new Date(binding.lastBoundAt)) : '',
    missingConfig,
    missingConfigText: missingConfig.join(', ')
  };
}

function requestJson(urlString, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const requestBody = options && options.body ? JSON.stringify(options.body) : '';
    const requestOptions = {
      method: (options && options.method) || 'GET',
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: Object.assign({
        Accept: 'application/json'
      }, (options && options.headers) || {})
    };

    if (requestBody) {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(requestBody);
    }

    const request = https.request(requestOptions, response => {
      const chunks = [];

      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8').trim();

        if (!raw) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error('WeChat API returned invalid JSON.'));
        }
      });
    });

    request.on('error', reject);

    if (requestBody) {
      request.write(requestBody);
    }

    request.end();
  });
}

async function getWeChatAccessToken() {
  const now = Date.now();

  if (accessTokenCache.value && accessTokenCache.expiresAt > now) {
    return accessTokenCache.value;
  }

  if (!wechatConfig.appId || !wechatConfig.appSecret) {
    throw new Error('缺少微信小程序 AppID 或 AppSecret。');
  }

  const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
  tokenUrl.searchParams.set('grant_type', 'client_credential');
  tokenUrl.searchParams.set('appid', wechatConfig.appId);
  tokenUrl.searchParams.set('secret', wechatConfig.appSecret);

  const result = await requestJson(tokenUrl.toString(), { method: 'GET' });

  if (result.errcode) {
    throw new Error(`获取微信 access_token 失败：${result.errmsg || result.errcode}`);
  }

  if (!result.access_token) {
    throw new Error('微信 access_token 返回为空。');
  }

  accessTokenCache = {
    value: result.access_token,
    expiresAt: now + Math.max((Number(result.expires_in) - 300) * 1000, 60 * 1000)
  };

  return accessTokenCache.value;
}

async function exchangeCodeForOpenId(code) {
  if (!wechatConfig.appId || !wechatConfig.appSecret) {
    throw new Error('缺少微信小程序 AppID 或 AppSecret。');
  }

  const sessionUrl = new URL('https://api.weixin.qq.com/sns/jscode2session');
  sessionUrl.searchParams.set('appid', wechatConfig.appId);
  sessionUrl.searchParams.set('secret', wechatConfig.appSecret);
  sessionUrl.searchParams.set('js_code', code);
  sessionUrl.searchParams.set('grant_type', 'authorization_code');

  const result = await requestJson(sessionUrl.toString(), { method: 'GET' });

  if (result.errcode) {
    throw new Error(`获取 openid 失败：${result.errmsg || result.errcode}`);
  }

  if (!result.openid) {
    throw new Error('微信接口没有返回 openid。');
  }

  return result.openid;
}

function buildSubscribeMessageData(order) {
  const dishSummary = trimText(order.items.map(item => `${item.name}x${item.qty}`).join('、'), 20);
  const remarkText = trimText(order.remark || '无备注', 20);

  const semanticValues = {
    orderer: trimText(order.nickname, 20),
    dishes: dishSummary,
    remark: remarkText,
    time: order.createdAtLabel,
    reserveTime: order.reserveTimeLabel
  };

  return Object.keys(wechatConfig.fields).reduce((data, semanticKey) => {
    const fieldKey = wechatConfig.fields[semanticKey];

    if (fieldKey) {
      data[fieldKey] = { value: semanticValues[semanticKey] };
    }

    return data;
  }, {});
}

function buildNotifyResult(status, label, detail) {
  return {
    notifyStatus: status,
    notifyStatusLabel: label,
    notifyDetail: detail || ''
  };
}

async function sendOrderNotification(order) {
  const status = await getWeChatStatus();

  if (!status.credentialsReady) {
    return buildNotifyResult('not_configured', '未配置微信凭据', '请先设置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。');
  }

  if (!status.templateReady) {
    return buildNotifyResult('no_template', '未配置订阅模板', '请先设置 WECHAT_NOTIFY_TEMPLATE_ID。');
  }

  const binding = await loadWeChatAdminBinding();

  if (!binding.openid) {
    return buildNotifyResult('not_bound', '未绑定接收人', '请先在小程序里绑定通知接收人。');
  }

  if (hasAdminWhitelist() && !isAdminOpenId(binding.openid)) {
    return buildNotifyResult('not_bound', '未绑定有效接收人', '当前绑定的接收人已不在管理员白名单，请重新绑定。');
  }

  try {
    const accessToken = await getWeChatAccessToken();
    const sendUrl = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`;
    const result = await requestJson(sendUrl, {
      method: 'POST',
      body: {
        touser: binding.openid,
        template_id: wechatConfig.templateId,
        page: wechatConfig.page,
        data: buildSubscribeMessageData(order)
      }
    });

    if (result.errcode) {
      return buildNotifyResult('failed', '通知发送失败', result.errmsg || String(result.errcode));
    }

    return buildNotifyResult('sent', '已发送微信通知', '');
  } catch (error) {
    return buildNotifyResult('failed', '通知发送失败', error.message || '未知错误');
  }
}

function normalizeOrderItems(rawItems) {
  const merged = new Map();

  rawItems.forEach(rawItem => {
    const id = Number(rawItem.id);
    const qty = Number(rawItem.qty);

    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
      throw new Error('Order items must include a valid integer id and qty.');
    }

    const menuItem = findItemById(id);

    if (!menuItem) {
      throw new Error(`Menu item ${id} does not exist.`);
    }

    const previousQty = merged.get(id) || 0;
    merged.set(id, previousQty + qty);
  });

  return Array.from(merged.entries()).map(([id, qty]) => {
    const menuItem = findItemById(id);
    return {
      id,
      name: menuItem.name,
      price: menuItem.price,
      qty,
      subtotal: menuItem.price * qty
    };
  });
}

function createOrderId() {
  return `ord_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function createOrder(payload) {
  const nickname = String(payload.nickname || '').trim();
  const remark = String(payload.remark || '').trim();
  const reserveTime = normalizeReserveTime(payload.reserveTime);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  if (!nickname) {
    return { statusCode: 400, body: { error: 'nickname is required.' } };
  }

  if (!rawItems.length) {
    return { statusCode: 400, body: { error: 'items is required.' } };
  }

  if (!reserveTime) {
    return { statusCode: 400, body: { error: 'reserveTime is required.' } };
  }

  const orderItems = normalizeOrderItems(rawItems);
  const totalCount = orderItems.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
  const createdAt = new Date();

  return {
    statusCode: 201,
    body: {
      id: createOrderId(),
      nickname,
      remark,
      reserveTime,
      reserveTimeLabel: reserveTime,
      status: 'submitted',
      statusLabel: '已提交',
      createdAt: createdAt.toISOString(),
      createdAtLabel: formatDateTime(createdAt),
      items: orderItems,
      totalCount,
      totalPrice,
      notifyStatus: 'pending',
      notifyStatusLabel: '待发送通知',
      notifyDetail: ''
    }
  };
}

function createServer({ exchangeCodeForOpenId: exchangeCodeForOpenIdImpl = exchangeCodeForOpenId } = {}) {
  return http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/menu') {
      sendJson(res, 200, { categories, items });
      return;
    }

    if (req.method === 'GET' && req.url === '/orders') {
      const adminAuth = await authorizeAdminCode(String(req.headers['x-wechat-code'] || '').trim());

      if (adminAuth.statusCode >= 400) {
        sendJson(res, adminAuth.statusCode, adminAuth.body);
        return;
      }

      const orders = (await loadOrders()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      sendJson(res, 200, { orders });
      return;
    }

    if (req.method === 'GET' && req.url === '/wechat/status') {
      const adminAuth = await authorizeAdminCode(String(req.headers['x-wechat-code'] || '').trim());

      if (adminAuth.statusCode >= 400) {
        sendJson(res, adminAuth.statusCode, adminAuth.body);
        return;
      }

      sendJson(res, 200, await getWeChatStatus());
      return;
    }

    if (req.method === 'POST' && req.url === '/wechat/bind-admin') {
      const payload = await readJsonBody(req);
      const code = String(payload.code || '').trim();
      const nickname = String(payload.nickname || '').trim();

      const adminAuth = await authorizeAdminCode(code);

      if (adminAuth.statusCode >= 400) {
        sendJson(res, adminAuth.statusCode, adminAuth.body);
        return;
      }

      const binding = {
        openid: adminAuth.body.openid,
        nickname: nickname || '管理员',
        lastBoundAt: new Date().toISOString()
      };

      await saveWeChatAdminBinding(binding);
      sendJson(res, 200, {
        nickname: binding.nickname,
        openidMasked: getMaskedOpenId(binding.openid),
        lastBoundAt: binding.lastBoundAt
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/wechat/debug-openid') {
      const payload = await readJsonBody(req);
      const validationResult = validateDebugOpenIdPayload(payload);

      if (validationResult.statusCode >= 400) {
        sendJson(res, validationResult.statusCode, validationResult.body);
        return;
      }

      const result = await lookupOpenIdForDebug(validationResult.body.code, exchangeCodeForOpenIdImpl);
      sendJson(res, result.statusCode, result.body);
      return;
    }

    if (req.method === 'POST' && req.url === '/orders') {
      const payload = await readJsonBody(req);
      const result = createOrder(payload);

      if (result.statusCode >= 400) {
        sendJson(res, result.statusCode, result.body);
        return;
      }

      await saveOrder(result.body);
      const notifyResult = await sendOrderNotification(result.body);
      const finalOrder = Object.assign(result.body, notifyResult);
      await saveOrder(finalOrder);
      sendJson(res, result.statusCode, finalOrder);
      return;
    }

    if (req.method === 'GET' && req.url === '/ping') {
      sendText(res, 200, 'pong');
      return;
    }

    sendText(res, 404, 'Not found');
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal server error.' });
  }
  });
}

async function startServer() {
  await init();
  const server = createServer();
  return new Promise(resolve => {
    server.listen(port, host, () => {
      console.log(`Server listening on ${host}:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildSubscribeMessageData,
  createOrderId,
  createOrder,
  createServer,
  isAdminOpenId,
  lookupOpenIdForDebug,
  normalizeReserveTime,
  validateDebugOpenIdPayload,
  startServer
};
