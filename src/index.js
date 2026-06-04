require('dotenv').config();

const sequelize = require('./db/index');
const app = require('./app');

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

main();
