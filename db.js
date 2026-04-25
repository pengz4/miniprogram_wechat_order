const { Sequelize, DataTypes } = require("sequelize");

const {
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  MYSQL_ADDRESS = "",
  MYSQL_DATABASE = "nodejs_demo",
  ALLOW_FILE_STORAGE = "",
} = process.env;

const [host, rawPort] = MYSQL_ADDRESS.split(":");
const port = rawPort ? Number(rawPort) : undefined;
const allowFileStorage = ALLOW_FILE_STORAGE === "true";
const hasAnyDatabaseSetting = Boolean(MYSQL_USERNAME || MYSQL_PASSWORD || MYSQL_ADDRESS);
const isDatabaseConfigured = Boolean(MYSQL_USERNAME && MYSQL_PASSWORD && host && port);

const sequelize = isDatabaseConfigured
  ? new Sequelize(MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_PASSWORD, {
      host,
      port,
      dialect: "mysql",
      logging: false,
    })
  : null;

const OrderRecord = isDatabaseConfigured
  ? sequelize.define(
      "OrderRecord",
      {
        id: {
          type: DataTypes.STRING(64),
          primaryKey: true,
        },
        createdAtSort: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        payload: {
          type: DataTypes.TEXT("long"),
          allowNull: false,
        },
      },
      {
        tableName: "orders",
        timestamps: true,
      }
    )
  : null;

const WeChatAdminBinding = isDatabaseConfigured
  ? sequelize.define(
      "WeChatAdminBinding",
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
        },
        openid: {
          type: DataTypes.STRING(128),
          allowNull: false,
          defaultValue: "",
        },
        nickname: {
          type: DataTypes.STRING(64),
          allowNull: false,
          defaultValue: "",
        },
        lastBoundAt: {
          type: DataTypes.STRING(64),
          allowNull: false,
          defaultValue: "",
        },
      },
      {
        tableName: "wechat_admin_bindings",
        timestamps: false,
      }
    )
  : null;

async function init() {
  if (!isDatabaseConfigured) {
    if (!allowFileStorage || hasAnyDatabaseSetting) {
      throw new Error(
        "Missing MySQL configuration. Set MYSQL_ADDRESS, MYSQL_USERNAME, MYSQL_PASSWORD for cloud deployment, or set ALLOW_FILE_STORAGE=true for local file-backed development."
      );
    }

    return;
  }

  await sequelize.authenticate();
  await OrderRecord.sync();
  await WeChatAdminBinding.sync();
}

module.exports = {
  init,
  allowFileStorage,
  isDatabaseConfigured,
  OrderRecord,
  WeChatAdminBinding,
};
