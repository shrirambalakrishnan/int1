require('dotenv').config();

const sequelize = require('./db/index');
const app = require('./app');

const { getChannel, closeRabbitMQ, initRabbitMQ } = require('./rabbitMQ');

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await initRabbitMQ();

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Unable to connect to the database:', error);

    await closeRabbitMQ();

    process.exit(1);
  }
}

main();
