const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logTransport = new DailyRotateFile({
  dirname: 'logs',
  filename: 'bot-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: false,
  maxSize: '5m',
  maxFiles: '7d',
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => {
        const now = new Date().toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        return now.replace(',', ''); // Убираем лишнюю запятую после даты
      },
    }),
    winston.format.printf(
      ({ timestamp, level, message }) =>
        `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [logTransport],
});

logger.info('This is an info log message!');

module.exports = logger;
