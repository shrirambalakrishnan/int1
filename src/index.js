require('dotenv').config()

const sequelize = require("./db/index")

async function connectDB() {

  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
  
}

function main() {

  connectDB()
  
}

main()