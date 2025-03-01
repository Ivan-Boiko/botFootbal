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
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) =>
        `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [logTransport],
});

logger.info('This is an info log message!');

module.exports = logger;
