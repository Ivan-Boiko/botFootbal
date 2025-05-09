'use strict';

const TelegramBot = require('node-telegram-bot-api');
const {
  nextWednesday,
  format,
  nextMonday,
  nextThursday,
  nextFriday,
} = require('date-fns');
const { ru } = require('date-fns/locale');
require('dotenv').config({ path: __dirname + '/.env' });
const logger = require('./logger');
const schedule = require('node-schedule');
// Токен бота - из переменных окружения для безопасности
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
console.log('TOKEN:', token);

// Переменная для хранения groupChatId
let groupChatId = parseInt(process.env.GROUP_CHAT_ID);
console.log('GROUP_CHAT_ID:', groupChatId);
let selectedAddress = '';
let selectedTime = '';
let isRecruitmentOpen = false;
let lastAnnouncedCount = 0;
let isWaitingForAddress = false;
let participants = {};
let addresses = [
  'ул. Константина Заслонова, 23 корпус 4',
  'ул. Обводный канал 74ф',
  'ул. Карпатская 8',
  'ул. Софийской 2',
];
// Функция для отправки сообщения с выбором времени
logger.info(`Бот инициализирован. Установлен чат группы ${groupChatId}`);

const dayCases = {
  понедельник: 'Понедельник',
  вторник: 'Вторник',
  среда: 'Среду',
  четверг: 'Четверг',
  пятница: 'Пятницу',
  суббота: 'Субботу',
  воскресенье: 'Воскресенье',
};

function getNextMonday() {
  return getNextFormattedDate(nextMonday, 'Следующий понедельник');
}

function getNextWednesday() {
  return getNextFormattedDate(nextWednesday, 'Следующая среда');
}

function getNextThursday() {
  return getNextFormattedDate(nextThursday, 'Следующий четверг');
}

function getNextFriday() {
  return getNextFormattedDate(nextFriday, 'Следующая пятница');
}

function getNextFormattedDate(nextDayFunction, label) {
  const today = new Date();
  const nextDay = nextDayFunction(today);
  let formattedDate = format(nextDay, 'eeee, dd.MM.yyyy', { locale: ru });
  formattedDate =
    formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  const dayName = formattedDate.split(',')[0]; // Берём название дня
  const correctedDay = dayCases[dayName.toLowerCase()] || dayName; // Подставляем нужное слово

  formattedDate = formattedDate.replace(dayName, correctedDay);
  logger.info(`${label}: ${formattedDate}`);
  return formattedDate;
}

// Слушаем сообщения и сохраняем chatId
bot.on('message', (msg) => {
  if (msg.from && msg.text) {
    logger.info(
      `Получено сообщение от ${msg.from.first_name} ${
        msg.from.last_name || ''
      } (ID: ${msg.from.id}): ${msg.text}`
    );
  }
  if (!groupChatId && msg.chat && msg.chat.id) {
    groupChatId = msg.chat.id;
    logger.info(`Установлен новый чат ID группы: ${groupChatId}`);
    bot
      .sendMessage(groupChatId, 'Бот настроен для работы с этим чатом!')
      .catch((err) => {
        logger.error(`Ошибка при отправке сообщения: ${err.message}`);
      });
  }
});

function handleChatMemberEvents(msg) {
  const chatId = msg.chat.id;

  // Обработка новых членов чата
  if (msg.new_chat_members) {
    const newUsers = msg.new_chat_members;
    newUsers.forEach((newUser) => {
      logger.info(
        `Новый участник в группе: ${newUser.first_name} (ID: ${newUser.id})`
      );
      bot
        .sendMessage(
          chatId,
          `Привет, ${newUser.first_name}! Добро пожаловать в группу!`
        )
        .catch((err) => {
          logger.error(`Ошибка при отправке приветствия: ${err.message}`);
        });
    });
  }

  // Обработка запроса на вступление в группу (например, через ссылку)
  if (msg.chat_join_request) {
    const joinRequest = msg.chat_join_request;

    if (joinRequest) {
      const userId = joinRequest.from.id;
      logger.info(
        `Получен запрос на вступление в группу от ${joinRequest.from.first_name} (ID: ${userId})`
      );
      bot
        .approveChatJoinRequest(chatId, userId)
        .then(() => {
          logger.info(
            `Запрос на вступление одобрен для ${joinRequest.from.first_name} (ID: ${userId})`
          );
          bot
            .sendMessage(
              chatId,
              `Пользователь ${joinRequest.from.first_name} присоединился к группе.`
            )
            .catch((err) => {
              logger.error(
                `Ошибка при отправке сообщения о присоединении: ${err.message}`
              );
            });
        })
        .catch((err) => {
          logger.error(
            `Ошибка при одобрении запроса на вступление: ${err.message}`
          );
          'Ошибка при одобрении запроса на вступление:', err;
        });
    }
  }

  // Обработка покидающих чат
  if (msg.left_chat_member) {
    const leftUser = msg.left_chat_member;
    logger.info(
      `Пользователь ${leftUser.first_name} (ID: ${leftUser.id}) покинул группу`
    );
    bot
      .sendMessage(chatId, `${leftUser.first_name} покинул группу`)
      .catch((err) => {
        logger.error(
          `Ошибка при отправке сообщения о выходе участника: ${err.message}`
        );
      });
  }
}

// Слушаем события: новые участники и запросы на вступление
bot.on('new_chat_members', handleChatMemberEvents);
bot.on('chat_join_request', handleChatMemberEvents);
bot.on('left_chat_member', handleChatMemberEvents);

// Функция для получения статуса участника
function getParticipantStatus(participant, userName) {
  if (participant.status === 'Готов') {
    if (participant.invitedFriends > 0) {
      return `${participant.name} | Позвал ${participant.invitedFriends}`;
    } else {
      return `${participant.name}`;
    }
  } else if (participant.status === 'Под Вопросом') {
    if (participant.invitedFriends > 0) {
      return `${participant.name} (${userName}) — Под Вопросом | Позвал ${participant.invitedFriends}`;
    } else {
      return `${participant.name} (${userName}) — Под Вопросом`;
    }
  } else if (participant.invitedFriends > 0) {
    return `${participant.name} — Не участвует, но позвал ${participant.invitedFriends}`;
  }
  return '';
}

// Функция обновления общего количества участников
function updateParticipantCount(chatId) {
  logger.info(`Обновление списка участников для чата ${chatId}`);
  let statusList = `\n\n⚽<b>Состав: \n\n</b>`; // Жирный заголовок

  let totalParticipants = 0;
  let readyCounter = 0; // Счётчик для участников в составе
  let questionCounter = 0; // Счётчик для участников под вопросом
  let notParticipatingCounter = 0; // Счётчик для участников, не участвующих, но приглашающих друзей

  let readyList = '';
  let questionList = '';
  let notParticipatingList = '';

  for (let userId in participants) {
    const participant = participants[userId];
    const invitedFriends = participant.invitedFriends || 0;
    const userName = participant.userName || '';

    if (participant.status === 'Готов') {
      if (invitedFriends > 0) {
        readyList += `${++readyCounter}. ${
          participant.name
        } | Позвал ${invitedFriends}\n`;
        totalParticipants += 1 + invitedFriends;
      } else {
        readyList += `${++readyCounter}. ${participant.name} \n`;
        totalParticipants += 1;
      }
    } else if (participant.status === 'Под Вопросом') {
      if (invitedFriends > 0) {
        questionList += `${++questionCounter}. ${
          participant.name
        } (${userName}) — Под Вопросом | Позвал ${invitedFriends}\n`;
        totalParticipants += invitedFriends;
      } else {
        questionList += `${++questionCounter}. ${
          participant.name
        } (${userName}) — Под Вопросом\n`;
      }
    } else if (invitedFriends > 0) {
      notParticipatingList += `${++notParticipatingCounter}. ${
        participant.name
      } — позвал ${invitedFriends}\n`;
      totalParticipants += invitedFriends;
    }
  }

  if (readyList) {
    statusList += `<b>Готовые участники</b>:\n${readyList}\n`; // Жирный заголовок
  }

  if (questionList) {
    statusList += `<b>Под вопросом:</b>\n${questionList}\n`; // Жирный заголовок
  }

  if (notParticipatingList) {
    statusList += `<b>Не участвуют, но позвали друзей:</b>\n${notParticipatingList}`; // Жирный заголовок
  }

  if (totalParticipants > 15 && totalParticipants !== lastAnnouncedCount) {
    lastAnnouncedCount = totalParticipants; // Обновляем последнее объявленное количество
    logger.info(`Достигнуто ${totalParticipants} участников.`);

    setTimeout(() => {
      bot
        .sendMessage(
          chatId,
          `<b>Внимание, количество участников составляет более 15 человек!</b>`,
          { parse_mode: 'HTML' }
        )
        .catch((err) => {
          logger.error(`Ошибка при отправке уведомления: ${err.message}`);
        });
    }, 5000);
  } else if (totalParticipants < 15) {
    lastAnnouncedCount = 0; // Если стало меньше 15, сбрасываем
  }
  let total = statusList + `<b>\nИтого:</b> ${totalParticipants}\n`;

  if (selectedAddress && selectedTime) {
    total += `\n<b>Адрес и время :</b> ${selectedAddress} ${selectedTime}`;
  }

  logger.info(`Общее количество участников: ${totalParticipants}`);

  return { total, totalParticipants };
}

function handleClosedRecruitment(chatId, userName) {
  logger.info(`${userName} пытается добавиться, когда набор закрыт`);
  bot
    .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
    .catch((err) => {
      logger.error(
        `Ошибка при отправке сообщения о закрытом наборе: ${err.message}`
      );
    });
}

// Обработка команд +, -, ?
bot.onText(/(\+|-|\?)(\d+)?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');
  const userUsername = msg.from.username || ''; // Сохраняем username
  const symbol = match[1];
  const number = parseInt(match[2], 10) || 0;

  logger.info(
    `Обработка команды ${symbol}${number} от ${userName} (ID: ${userId})`
  );

  // Создаём участника, если он ещё не зарегистрирован
  if (!participants[userId]) {
    logger.info(`Создание нового участника: ${userName} (ID: ${userId})`);
    participants[userId] = {
      name: userName,
      status: 'Не участвует',
      invitedFriends: 0,
      userName: userUsername, // Сохраняем username
    };
  }

  const participant = participants[userId];

  if (symbol === '+') {
    // Проверяем, что сообщение содержит только "+" или "+число"
    const plusPattern = /^\+\d*$/; // "+" или "+число"
    if (!plusPattern.test(msg.text.trim())) {
      return; // Игнорируем, если сообщение не соответствует формату
    }

    const number =
      msg.text.trim() === '+' ? 0 : parseInt(msg.text.slice(1), 10);

    if (number === 0 && msg.text.trim() !== '+') {
      logger.warn(`${userName} пытается добавить 0 человек`);
      bot
        .sendMessage(chatId, '**Нельзя добавить 0 человек.**', {
          parse_mode: 'Markdown',
        })
        .catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения об ошибке: ${err.message}`
          );
        });
      return;
    }

    if (!isRecruitmentOpen) {
      logger.info(`${userName} пытается добавиться, когда набор закрыт`);
      bot
        .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
        .catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения о закрытом наборе: ${err.message}`
          );
        });
      return;
    }

    // if (number > 5) {
    //   logger.warn(`${userName} пытается призвать более 5 друзей: ${number}`);
    //   bot
    //     .sendMessage(
    //       chatId,
    //       `${userName}, ты можешь призывать не больше 5 друзей`
    //     )
    //     .catch((err) => {
    //       logger.error(`Ошибка при отправке предупреждения: ${err.message}`);
    //     });
    //   return;
    // }

    if (participant.status === 'Готов') {
      if (number > 0) {
        // Добавление друзей, если статус "Готов"
        participant.invitedFriends += number;
        logger.info(
          `${userName} добавил ${number} друзей, новое количество: ${participant.invitedFriends}`
        );
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} Позвал +${number}. \nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            logger.error(
              `Ошибка при обновлении сообщения о добавлении друзей: ${err.message}`
            );
          });
      } else {
        // Если просто "+" и статус "Готов", выводим сообщение
        logger.info(`${userName} уже в составе, повторное добавление`);
        bot.sendMessage(chatId, `${userName} Ты уже в составе`).catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения о статусе: ${err.message}`
          );
        });
        return;
      }
    } else {
      // Если пользователь не в составе, записываем его в состав
      if (number > 0) {
        // Добавление друзей
        participant.invitedFriends += number;
        logger.info(`${userName} не участвует, но позвал ${number} друзей`);
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} не участвует, но позвал ${number} друзей.\nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            logger.error(
              `Ошибка при отправке сообщения о неучастнике: ${err.message}`
            );
          });
      } else {
        // Запись в состав
        participant.status = 'Готов';
        logger.info(`${userName} добавлен в состав`);
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} добавлен в состав.\nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            logger.error(
              `Ошибка при отправке сообщения о добавлении: ${err.message}`
            );
          });
      }
      bot.deleteMessage(chatId, msg.message_id).catch((err) => {
        logger.error(`Ошибка при удалении сообщения: ${err.message}`);
        'Ошибка при удалении сообщения:', err;
      });
    }
  } else if (symbol === '-') {
    const plusPattern = /^\-\d*$/; // Регулярное выражение: "-" или "-число"
    if (!plusPattern.test(msg.text.trim())) {
      return; // Игнорируем, если сообщение не соответствует формату
    }

    const number =
      msg.text.trim() === '-' ? 0 : parseInt(msg.text.slice(1), 10);

    if (number === 0 && msg.text.trim() !== '-') {
      logger.warn(`${userName} пытается убрать 0 человек`);
      bot
        .sendMessage(chatId, `${userName}, нельзя убрать 0 человек.`)
        .catch((err) => {
          logger.error(`Ошибка при отправке предупреждения: ${err.message}`);
        });
      return;
    }

    if (!isRecruitmentOpen) {
      handleClosedRecruitment(chatId, userName);
      return;
    }

    if (number > 0) {
      // Удаление друзей
      if (participant.invitedFriends < number) {
        // Если число больше количества друзей
        logger.warn(
          `${userName} пытается убрать ${number} друзей, но имеет только ${participant.invitedFriends}`
        );
        bot
          .sendMessage(
            chatId,
            `${userName}, ты не призывал так много друзей! Ты можешь убрать только ${participant.invitedFriends}`
          )
          .catch((err) => {
            logger.error(
              `Ошибка при отправке сообщения о превышении: ${err.message}`
            );
          });
      } else {
        // Уменьшение количества друзей
        participant.invitedFriends -= number;
        logger.info(
          `${userName} убрал ${number} друзей, осталось: ${participant.invitedFriends}`
        );
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} сделал -${number}. \nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            logger.error(
              `Ошибка при отправке сообщения об уменьшении: ${err.message}`
            );
          });
      }
    } else {
      // Удаление из состава
      if (participant.status === 'Не участвует') {
        // Если пользователь уже не в составе
        logger.info(`${userName} пытается выйти, но уже не в составе`);
        bot
          .sendMessage(chatId, `${userName}, тебя и так нет в составе.`)
          .catch((err) => {
            logger.error(
              `Ошибка при отправке сообщения о статусе: ${err.message}`
            );
          });
      } else {
        // Удаление пользователя из состава
        participant.status = 'Не участвует';
        logger.info(`${userName} убран из состава`);
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} убран из состава. \nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            logger.error(
              `Ошибка при отправке сообщения об удалении: ${err.message}`
            );
          });
      }
      bot.deleteMessage(chatId, msg.message_id).catch((err) => {
        logger.error(`Ошибка при удалении сообщения: ${err.message}`);
        'Ошибка при удалении сообщения:', err;
      });
    }
  } else if (symbol === '?') {
    if (msg.text.trim() !== '?') {
      return; // Если это не строго "?", ничего не делаем
    }

    if (!isRecruitmentOpen) {
      if (!isRecruitmentOpen) {
        handleClosedRecruitment(chatId, userName);
        return;
      }
      return;
    }

    // Изменение статуса на "Под вопросом"
    if (participant.status === 'Под Вопросом') {
      logger.info(`${userName} уже имеет статус "Под вопросом"`);
      bot
        .sendMessage(chatId, `${userName}, ты уже под вопросом.`)
        .catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения о статусе: ${err.message}`
          );
        });
    } else {
      participant.status = 'Под Вопросом';
      logger.info(`${userName} изменил статус на "Под Вопросом"`);
      const { totalParticipants } = updateParticipantCount(chatId);
      bot
        .sendMessage(
          chatId,
          `${userName} изменил статус на "Под Вопросом".\nИтого: ${totalParticipants}`
        )
        .catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения о смене статуса: ${err.message}`
          );
        });
    }
    bot.deleteMessage(chatId, msg.message_id).catch((err) => {
      logger.error(`Ошибка при удалении сообщения: ${err.message}`);
      'Ошибка при удалении сообщения:', err;
    });
  }

  // Обновляем состав
  updateParticipantCount(chatId);
});

// Обработка команды Состав
bot.onText(/Состав$/, (msg) => {
  const chatId = msg.chat.id;
  const pattern = /^Состав$/;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');

  logger.info(`${userName} (ID: ${msg.from.id}) запросил информацию о составе`);

  if (!pattern.test(msg.text.trim())) {
    return; // Игнорируем, если сообщение не соответствует формату
  }

  if (!isRecruitmentOpen) {
    if (!isRecruitmentOpen) {
      handleClosedRecruitment(chatId, userName);
      return;
    }
  }

  const updateParticipantCountTeam = updateParticipantCount(chatId);
  logger.info(
    `Отправка информации о количестве игроков: ${updateParticipantCountTeam.totalParticipants}`
  );
  bot
    .sendMessage(
      chatId,
      `Игроки в статусе 'Готов': ${updateParticipantCountTeam.totalParticipants}`
    )
    .catch((err) => {
      logger.error(`Ошибка при отправке информации о составе: ${err.message}`);
    });
});

// Обработка команды Игроки
bot.onText(/Игроки$/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');

  logger.info(
    `${userName} (ID: ${msg.from.id}) запросил полный список игроков`
  );

  if (!isRecruitmentOpen) {
    handleClosedRecruitment(chatId, userName);
    return;
  }

  const updateParticipantCountTotal = updateParticipantCount(chatId);

  // Создаем сообщение с информацией о датах и списком игроков
  const message = `
  ${updateParticipantCountTotal.total}
  `;

  bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
  });
});
// Обработка команды Дата
bot.onText(/Дата$/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');
  const nextThursday = getNextThursday(); // Уже отформатированная дата набора (среда)
  const nextWednesday = getNextWednesday(); // Уже отформатированная дата игры (пятница)

  logger.info(
    `${userName} (ID: ${msg.from.id}) запросил полный список игроков`
  );

  if (!isRecruitmentOpen) {
    handleClosedRecruitment(chatId, userName);
    return;
  }

  // Создаем сообщение с информацией о датах и списком игроков
  const message = `
📅 <b>Ближайшие даты:</b>
🔹 <b>Набор игроков:</b> ${nextThursday} 13:00
🔹 <b>Дата игры:</b> ${nextWednesday} 20:30
  `;
  bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
  });
});
// Обработка команды Инфо
bot.onText(/Инфо$/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');
  logger.info(
    `${userName} (ID: ${msg.from.id}) запросил информацию о командах`
  );
  sendInfoMessage(chatId);
});

function sendInfoMessage(chatId) {
  logger.info(`Отправка информационного сообщения в чат ${chatId}`);
  const infoMessage = `
Добро пожаловать! ⚽
"+" — записаться на матч.
"-" — отменить запись.
"+число" (напр., "+3") — добавить друзей.
"-число" (напр., "-2") — убрать добавленных друзей.
"?" — статус "Под вопросом".
"Инфо" — информация о возможностях бота.
"Состав" — посмотреть количество людей.
"Игроки" — посмотреть общий состав.
"Дата" — посмотреть ближашие дату открытия набора и следующей игры.
  `;
  bot.sendMessage(chatId, infoMessage).catch((err) => {
    logger.error(
      `Ошибка при отправке информационного сообщения: ${err.message}`
    );
  });
}

// Функция для формирования сообщения с тегами и именами
function generateReminderMessage(teamMass) {
  let taggedUsers = '';
  let untaggedUsers = '';
  let taggedCount = 0;
  let untaggedCount = 0;

  for (let userId in teamMass) {
    const participant = teamMass[userId];

    if (participant.status === 'Под Вопросом') {
      if (participant.userName) {
        taggedUsers += `@${participant.userName} <b>${participant.name}</b>\n`;
        taggedCount++;
      } else {
        untaggedUsers += `<b>${participant.name}</b>\n`;
        untaggedCount++;
      }
    }
  }

  // Если нет ни одного участника "Под Вопросом", ничего не возвращаем
  if (taggedCount === 0 && untaggedCount === 0) {
    return null;
  }

  // Формируем сообщение
  let finalMessage = `Уважаемые игроки, скоро начнется футбол!\nПрошу дать окончательный ответ по участию в сегодняшней игре. Спасибо 😊 
     Cписок игроков в статусе 'Под вопросом'\n`;
  if (taggedUsers) {
    finalMessage += taggedUsers;
  }

  if (untaggedUsers) {
    finalMessage += untaggedUsers;
  }

  return finalMessage;
}

// Административные команды
bot.onText(/\/(start|close|address)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');
  const command = match[1];
  const tag = msg.from.username;

  logger.info(
    `${userName} (ID: ${userId}) выполняет административную команду ${command}`
  );

  const member = await bot.getChatMember(chatId, userId).catch((err) => {
    logger.error(`Ошибка при получении информации о чате: ${err.message}`);
    'Ошибка при получении информации о чате:', err;
    return null;
  });

  if (
    !member ||
    !['administrator', 'creator', 'address'].includes(member.status)
  ) {
    logger.warn(
      `${userName} пытается выполнить админ-команду без прав: ${command}`
    );
    return;
  }

  if (command === 'start') {
    if (isRecruitmentOpen) {
      logger.info('Попытка открыть набор, когда он уже открыт');
      bot.sendMessage(chatId, 'Сбор уже запущен!').catch((err) => {
        logger.error(`Ошибка при отправке сообщения: ${err.message}`);
      });
    } else {
      isRecruitmentOpen = true;
      participants = {};
      selectedAddress = '';
      selectedTime = '';
      logger.info(`${userName} открыл набор вручную`);
      bot
        .sendMessage(
          chatId,
          'Набор на матч начался! Напиши "+", "-", "?" для взаимодействия.'
        )
        .catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения об открытии набора: ${err.message}`
          );
        });
    }
  } else if (command === 'close') {
    if (!isRecruitmentOpen) {
      logger.info('Попытка закрыть набор, когда он уже закрыт');
      bot.sendMessage(chatId, 'Сбор ещё не начинался.').catch((err) => {
        logger.error(`Ошибка при отправке сообщения: ${err.message}`);
      });
    } else {
      isRecruitmentOpen = false;
      updateParticipantCount(chatId);
      logger.info(`${userName} закрыл набор вручную`);

      // Всегда следующий набор — в ближайший четверг в 10:30
      const nextRecruitmentDate = nextThursday(new Date());
      const nextRecruitmentTime = '10:30';
      const formattedDate = format(nextRecruitmentDate, 'dd.MM.yyyy');

      bot
        .sendMessage(
          chatId,
          `Сбор завершён! Следующий набор будет ${formattedDate}, начнется в ${nextRecruitmentTime}.`
        )
        .catch((err) => {
          logger.error(
            `Ошибка при отправке сообщения о завершении набора: ${err.message}`
          );
        });
    }
  } else if (command === 'address') {
    logger.info(`${userName} вызвал команду /address`);

    if (!isRecruitmentOpen) {
      bot.sendMessage(
        chatId,
        'Сейчас нельзя установить адрес, так как набор закрыт.'
      );
      return;
    }

    if (member.status !== 'creator' && member.status !== 'administrator') {
      bot.sendMessage(chatId, 'Нет');
      return;
    }

    if (isWaitingForAddress) {
      bot.sendMessage(
        chatId,
        'Вы уже запустили команду /address. Ожидание ввода адреса.'
      );
      return;
    }

    isWaitingForAddress = true;
    let response = 'Введите адрес или выберите из существующих:\n';

    addresses.forEach((address, index) => {
      response += `${index + 1}. ${address}\n`;
    });
    bot.sendMessage(chatId, response);

    const addressListener = (response) => {
      if (response.text.toLowerCase() === 'отмена') {
        bot.sendMessage(chatId, 'Команда отменена. Запустите команду заново.');
        clearTimeout(addressTimeout);
        clearTimeout(cancelTimeout);
        bot.off('message', addressListener);
        isWaitingForAddress = false;
        return;
      }

      const choice = parseInt(response.text);
      if (!isNaN(choice) && choice >= 1 && choice <= addresses.length) {
        selectedAddress = addresses[choice - 1];
        bot.sendMessage(chatId, `Адрес установлен: ${selectedAddress}`);
      } else {
        selectedAddress = response.text;
        bot.sendMessage(
          chatId,
          `Адрес установлен: ${selectedAddress}. Адресс будет добавлен в список позже`
        );
        logger.info(`⚠️ Новый адрес, добавить вручную: ${selectedAddress}`);
      }

      isWaitingForAddress = false;
      bot.off('message', addressListener);

      const times = ['20:00', '20:30', '21:00', '21:30'];

      let timeResponse = 'Выберите время начала матча:\n';
      times.forEach((time, index) => {
        timeResponse += `${index + 1}. ${time}\n`;
      });
      bot.sendMessage(chatId, timeResponse);

      // Слушаем выбор времени
      bot.once('message', (msg) => {
        const choice = parseInt(msg.text);
        if (choice >= 1 && choice <= times.length) {
          selectedTime = times[choice - 1];
          bot.sendMessage(chatId, `Время установлено: ${selectedTime}`);

          // Закрепляем сообщение с выбранным адресом и временем
          const finalMessage = `Адрес: ${selectedAddress}, Время: ${selectedTime}`;
          bot
            .sendMessage(chatId, finalMessage)
            .then((sentMessage) => {
              bot.pinChatMessage(chatId, sentMessage.message_id);
            })
            .catch((err) =>
              console.error(`Ошибка при закреплении сообщения: ${err.message}`)
            );
        } else {
          bot.sendMessage(chatId, 'Некорректный выбор времени.');
        }
      });
      // Закрепляем сообщение пользователя с адресом

      clearTimeout(addressTimeout);
      clearTimeout(cancelTimeout);
      isWaitingForAddress = false;
      bot.off('message', addressListener);
    };

    bot.on('message', addressListener);

    let addressTimeout = setTimeout(() => {
      bot.sendMessage(
        chatId,
        `@${tag} ${userName}, напомню, нужно указать адрес!`
      );
    }, 5 * 60 * 1000);

    let cancelTimeout = setTimeout(() => {
      bot.sendMessage(chatId, 'Время вышло, команда /address отменена.');
      isWaitingForAddress = false;
      bot.off('message', addressListener);
    }, 10 * 60 * 1000);
  }
});

// Автоматическое открытие Среда
schedule.scheduleJob({ dayOfWeek: 3, hour: 13, minute: 0 }, () => {
  if (isRecruitmentOpen) {
    logger.info('Попытка открыть набор, когда он уже открыт');
    return;
  }

  const nextFriday = getNextFriday();
  logger.info(
    'Выполнение запланированной задачи: автоматическое открытие набора'
  );
  isRecruitmentOpen = true;
  participants = {};
  selectedAddress = '';
  selectedTime = '';
  bot
    .sendMessage(
      groupChatId,
      `Набор на <b>${nextFriday}</b> открыт! Записывайтесь и зовите друзей!`,
      { parse_mode: 'HTML' }
    )
    .catch((err) => {
      logger.error(
        `Ошибка при отправке сообщения об открытии набора: ${err.message}`
      );
    });
});

//Тегаем участников
schedule.scheduleJob({ dayOfWeek: 5, hour: 15, minute: 0 }, () => {
  if (!isRecruitmentOpen) {
    logger.info('Состав закрыт');
    return;
  }
  logger.info(
    'Выполнение запланированной задачи: тегирование участников со статусом "Под вопросом"'
  );
  const message = generateReminderMessage(participants);
  bot.sendMessage(groupChatId, message, { parse_mode: 'HTML' });
});

// Выводим список игроков перед футболом
schedule.scheduleJob({ dayOfWeek: 5, hour: 19, minute: 30 }, () => {
  if (!isRecruitmentOpen) {
    logger.info('Состав закрыт');
    return;
  }
  logger.info(
    'Выполнение запланированной задачи: отправка списка игроков перед футболом'
  );
  const updateParticipantCountTotal = updateParticipantCount(groupChatId);
  const message = `Футбол скоро начнется...
${updateParticipantCountTotal.total}
  `;
  bot
    .sendMessage(groupChatId, message.trimStart(), { parse_mode: 'HTML' })
    .catch((err) => {
      logger.error(
        `Ошибка при отправке списка игроков перед футболом: ${err.message}`
      );
    });
});

// Сброс состава.
schedule.scheduleJob({ dayOfWeek: 5, hour: 21, minute: 30 }, () => {
  if (!isRecruitmentOpen) {
    logger.info('Попытка сбросить состав, когда набор закрыт');
    return;
  }
  const nextWednesday = getNextWednesday();
  logger.info('Выполнение запланированной задачи: сброс состава');
  isRecruitmentOpen = false;
  updateParticipantCount(groupChatId);
  bot
    .sendMessage(
      groupChatId,
      `Состав был сброшен! Следующий набор откроется в ${nextWednesday} в 13:00.`
    )
    .catch((err) => {
      logger.error(
        `Ошибка при отправке сообщения о сбросе состава: ${err.message}`
      );
    });
});

schedule.scheduleJob(new Date(Date.now() + 1 * 30 * 1000), () => {
  logger.info('Бот запущен и готов к работе');

  const infoMessage = `Всем здравия!
  Снова с вами, слушаю чат, готов поддерживать движ.`;

  bot.sendMessage(chatId, infoMessage).catch((err) => {
    logger.error(
      `Ошибка при отправке информационного сообщения: ${err.message}`
    );
  });
});
