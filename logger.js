const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [ // Вывод в консоль
    new winston.transports.File({ filename: 'bot.log' }) // Сохранение в файл
  ]
});

module.exports = logger;
