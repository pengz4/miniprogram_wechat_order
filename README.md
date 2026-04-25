# miniprogram_wechat_order

微信云托管家庭点餐小程序，保留了云托管模板的根目录部署方式，并接入一套可直接运行的小程序前端与 Node 后端。

## 项目结构

```text
.
├── Dockerfile
├── README.md
├── backend/
│   ├── data/
│   ├── server.js
│   └── server.test.js
├── container.config.json
├── index.js
├── miniprogram/
│   ├── app.js
│   ├── app.json
│   ├── config.js
│   ├── data/
│   ├── pages/
│   └── utils/
├── package.json
└── project.config.json
```

## 本地运行

安装依赖：

```bash
npm install
```

本地使用文件存储启动后端：

```bash
ALLOW_FILE_STORAGE=true npm start
```

默认本地监听 `3000`；在微信云托管中会自动使用运行时注入的 `PORT`。

## 测试

```bash
npm test
```

当前会运行：

- `backend/server.test.js`
- `miniprogram/utils/reserve-time.test.js`

## 小程序配置

小程序接口基地址在 `miniprogram/config.js`：

- 默认提交值：`https://express-lubj-250721-6-1425776465.sh.run.tcloudbase.com`
- 如需本机联调，可临时改回：`http://127.0.0.1:3000`

微信开发者工具项目入口使用根目录 `project.config.json`，其中 `miniprogramRoot` 指向 `miniprogram/`。

## 后端接口

- `GET /menu`
- `GET /orders`
- `POST /orders`
- `GET /wechat/status`
- `POST /wechat/bind-admin`
- `GET /ping`

`GET /ping` 用于最小健康检查，返回 `pong`。

## 云托管环境变量

云托管下，订单和管理员绑定会写入 MySQL；本地开发如果不想连 MySQL，可显式使用 `ALLOW_FILE_STORAGE=true` 回退到 `backend/data/*.json`。

微信通知相关变量通过云托管控制台配置，不要写进仓库：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_NOTIFY_TEMPLATE_ID`
- `WECHAT_ADMIN_OPENIDS`
- `WECHAT_NOTIFY_PAGE`
- `WECHAT_NOTIFY_FIELD_ORDERER`
- `WECHAT_NOTIFY_FIELD_DISHES`
- `WECHAT_NOTIFY_FIELD_REMARK`
- `WECHAT_NOTIFY_FIELD_TIME`
- `WECHAT_NOTIFY_FIELD_RESERVE_TIME`

## 数据文件

仓库里保留两个安全种子文件：

- `backend/data/orders.json` 提交为 `[]`
- `backend/data/wechat-admin.json` 提交为 `{}`

本地调试产生的真实订单和绑定信息不要提交到 GitHub。

## 云托管 MySQL

如果你沿用模板自带的云托管 MySQL，控制台里需要提供：

- `MYSQL_ADDRESS`
- `MYSQL_USERNAME`
- `MYSQL_PASSWORD`
- 可选：`MYSQL_DATABASE`（默认 `nodejs_demo`）

应用启动时会自动建表：

- `orders`
- `wechat_admin_bindings`

## 管理员权限

以下接口现在要求管理员白名单身份：

- `GET /orders`
- `GET /wechat/status`
- `POST /wechat/bind-admin`

白名单通过 `WECHAT_ADMIN_OPENIDS` 配置，多个 OpenID 用英文逗号分隔。小程序会在访问这些接口前先执行 `wx.login`，把 code 交给后端换取 openid 后再做校验。
