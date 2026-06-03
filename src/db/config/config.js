require('dotenv').config();

const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: `${process.env.DB_NAME}_${process.env.ENV}`,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
};

module.exports = { 
  development: common, 
  test: common, 
  production: common
};
