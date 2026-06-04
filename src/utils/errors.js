'use strict';

/**
 * Maps an error thrown inside a controller to an HTTP response.
 * Known Sequelize client errors become 4xx; anything else is forwarded
 * to the central error handler (500).
 */
function sendError(res, next, err) {
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: err.errors.map((e) => e.message) });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: err.errors.map((e) => e.message) });
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }
  return next(err);
}

module.exports = { sendError };
