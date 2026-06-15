require('dotenv').config();

const sequelize = require('./db/index');
const { closeRabbitMQ, initRabbitMQ, consume } = require('./rabbitMQ');
const { processEvent } = require('./integration/eventProcessor');

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    await initRabbitMQ();

    await consume(processEvent);
    console.log('Worker listening on int1worker.queue');
  } catch (error) {
    console.error('Unable to connect to the database / rabbitmq:', error);

    await closeRabbitMQ();

    process.exit(1);
  }
}

main();
