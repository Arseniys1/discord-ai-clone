require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key-change-this-in-production",
  NODE_ENV: process.env.NODE_ENV || "development",
  DB_PATH: process.env.DB_PATH || "./database.sqlite"
};
