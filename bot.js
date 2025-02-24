'use strict';

const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const { nextWednesday, format } = require('date-fns');
require('dotenv').config();
// Токен бота
const token = process.env.TOKEN; // Используйте переменные окружения для хранения токена
const bot = new TelegramBot(token, { polling: true });

// Переменная для хранения groupChatId
let groupChatId = process.env.GROUP_CHAT_ID;
// Состояние бота и участники
let isRecruitmentOpen = false;
let participants = {};

function getNextWednesday() {
  const today = new Date(); // Текущая дата
  return nextWednesday(today); // Используем date-fns для получения следующей среды
}

// Слушаем сообщения и сохраняем chatId
bot.on('message', (msg) => {
  if (!groupChatId && msg.chat && msg.chat.id) {
    groupChatId = msg.chat.id;
    bot
      .sendMessage(groupChatId, 'Бот настроен для работы с этим чатом!')
      .catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
  }
});

function handleChatMemberEvents(msg) {
  const chatId = msg.chat.id;

  // Обработка новых членов чата
  if (msg.new_chat_members) {
    const newUsers = msg.new_chat_members;
    newUsers.forEach((newUser) => {
      bot
        .sendMessage(
          chatId,
          `Привет, ${newUser.first_name}! Добро пожаловать в группу!`
        )
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
    });
  }

  // Обработка запроса на вступление в группу (например, через ссылку)
  if (msg.chat_join_request) {
    const joinRequest = msg.chat_join_request;

    if (joinRequest) {
      const userId = joinRequest.from.id;
      bot
        .approveChatJoinRequest(chatId, userId)
        .then(() => {
          bot
            .sendMessage(
              chatId,
              `Пользователь ${joinRequest.from.first_name} присоединился к группе.`
            )
            .catch((err) => {
              console.error('Ошибка при отправке сообщения:', err);
            });
        })
        .catch((err) => {
          console.error('Ошибка при одобрении запроса на вступление:', err);
        });
    }
  }
}

// Слушаем события: новые участники и запросы на вступление
bot.on('new_chat_members', handleChatMemberEvents);
bot.on('chat_join_request', handleChatMemberEvents);

// Функция обновления общего количества участников
function getParticipantStatus(participant, userName) {
  if (participant.status === 'Готов') {
    if (participant.invitedFriends > 0) {
      return `${participant.name} — Готов | Позвал ${participant.invitedFriends}`;
    } else {
      return `${participant.name} — Готов`;
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

function updateParticipantCount(chatId) {
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
        } — Готов | Позвал ${invitedFriends}\n`;
        totalParticipants += 1 + invitedFriends;
      } else {
        readyList += `${++readyCounter}. ${participant.name} — Готов\n`;
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
    statusList += `<b>Не участвуют, но позвали друзей:</b>\n${notParticipatingList}\n`; // Жирный заголовок
  }

  if (totalParticipants >= 15) {
    bot
      .sendMessage(
        chatId,
        '<b>Внимание, количество участников составляет 15 человек!</b>',
        { parse_mode: 'HTML' }
      )
      .catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
  }

  let total = statusList + `<b>\nИтого:</b> ${totalParticipants} `;

  return { total, totalParticipants };
}
// Обработка команд +, -, ?
bot.onText(/(\+|-|\?)(\d+)?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');
  const userUsername = msg.from.username || ''; // Сохраняем username
  const symbol = match[1];
  const number = parseInt(match[2], 10) || 0;

  // Создаём участника, если он ещё не зарегистрирован
  if (!participants[userId]) {
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
      bot
        .sendMessage(chatId, '**Нельзя добавить 0 человек.**', {
          parse_mode: 'Markdown',
        })
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
      return;
    }

    if (!isRecruitmentOpen) {
      bot
        .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
        .catch((err) => {
          console.error(' Ошибка при отправке сообщения:', err);
        });
      return;
    }

    if (number > 5) {
      bot
        .sendMessage(
          chatId,
          `${userName}, ты можешь призывать не больше 5 друзей`
        )
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
      return;
    }

    if (participant.status === 'Готов') {
      if (number > 0) {
        // Добавление друзей, если статус "Готов"
        participant.invitedFriends += number;
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} позвал +${number}. \nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      } else {
        // Если просто "+" и статус "Готов", выводим сообщение
        bot.sendMessage(chatId, 'Ты уже в составе').catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
        return;
      }
    } else {
      // Если пользователь не в составе, записываем его в состав
      if (number > 0) {
        // Добавление друзей
        participant.invitedFriends += number;
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} не участвует, но позвал ${number} друзей.\nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      } else {
        // Запись в состав
        participant.status = 'Готов';
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} добавлен в состав.\nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      }
      bot.deleteMessage(chatId, msg.message_id).catch((err) => {
        console.error('Ошибка при удалении сообщения:', err);
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
      bot.sendMessage(chatId, 'Нельзя убрать 0 человек.').catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
      return;
    }

    if (!isRecruitmentOpen) {
      bot
        .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
      return;
    }

    if (number > 0) {
      // Удаление друзей
      if (participant.invitedFriends < number) {
        // Если число больше количества друзей
        bot
          .sendMessage(
            chatId,
            `${userName}, ты не призывал так много друзей! Ты можешь убрать ${participant.invitedFriends}`
          )
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      } else {
        // Уменьшение количества друзей
        participant.invitedFriends -= number;
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} сделал -${number}. \nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      }
    } else {
      // Удаление из состава
      if (participant.status === 'Не участвует') {
        // Если пользователь уже не в составе
        bot
          .sendMessage(chatId, `${userName}, тебя и так нет в составе.`)
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      } else {
        // Удаление пользователя из состава
        participant.status = 'Не участвует';
        const { totalParticipants } = updateParticipantCount(chatId);
        bot
          .sendMessage(
            chatId,
            `${userName} убран из состава. \nИтого: ${totalParticipants}`
          )
          .catch((err) => {
            console.error('Ошибка при отправке сообщения:', err);
          });
      }
      bot.deleteMessage(chatId, msg.message_id).catch((err) => {
        console.error(' Ошибка при удалении сообщения:', err);
      });
    }
  } else if (symbol === '?') {
    if (msg.text.trim() !== '?') {
      return; // Если это не строго "?", ничего не делаем
    }

    if (!isRecruitmentOpen) {
      bot
        .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
      return;
    }

    // Изменение статуса на "Под вопросом"
    if (participant.status === 'Под Вопросом') {
      bot
        .sendMessage(chatId, `${userName}, ты уже под вопросом.`)
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
    } else {
      participant.status = 'Под Вопросом';
      const { totalParticipants } = updateParticipantCount(chatId);
      bot
        .sendMessage(
          chatId,
          `${userName} изменил статус на "Под Вопросом".\nИтого: ${totalParticipants}`
        )
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
    }
    bot.deleteMessage(chatId, msg.message_id).catch((err) => {
      console.error('Ошибка при удалении сообщения:', err);
    });
  }

  // Обновляем состав
  updateParticipantCount(chatId);
});

// Обработка команды Состав
bot.onText(/Состав$/, (msg) => {
  const chatId = msg.chat.id;
  const pattern = /^Состав$/;

  if (!pattern.test(msg.text.trim())) {
    return; // Игнорируем, если сообщение не соответствует формату
  }

  if (!isRecruitmentOpen) {
    bot
      .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
      .catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
    return;
  }

  const updateParticipantCountTeam = updateParticipantCount(chatId);
  bot
    .sendMessage(
      chatId,
      `Игроки в статусе 'Готов': ${updateParticipantCountTeam.totalParticipants}`
    )
    .catch((err) => {
      console.error('Ошибка при отправке сообщения:', err);
    });
});

// Обработка команды Игроки
bot.onText(/Игроки$/, (msg) => {
  const chatId = msg.chat.id;
  const pattern = /^Игроки$/;

  if (!pattern.test(msg.text.trim())) {
    return; // Игнорируем, если сообщение не соответствует формату
  }

  if (!isRecruitmentOpen) {
    bot
      .sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!')
      .catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
    return;
  }

  const updateParticipantCountTotal = updateParticipantCount(chatId);
  bot
    .sendMessage(chatId, updateParticipantCountTotal.total, {
      parse_mode: 'HTML',
    })
    .catch((err) => {
      console.error('Ошибка при отправке сообщения:', err);
    });
});

// Обработка команды Инфо
bot.onText(/Инфо$/, (msg) => {
  const chatId = msg.chat.id;
  sendInfoMessage(chatId);
});

function sendInfoMessage(chatId) {
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
  `;
  bot.sendMessage(chatId, infoMessage).catch((err) => {
    console.error('Ошибка при отправке сообщения:', err);
  });
}

// Административные команды
bot.onText(/\/(start|close)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = match[1];

  const member = await bot.getChatMember(chatId, userId).catch((err) => {
    console.error('Ошибка при получении информации о чате:', err);
    return null;
  });

  if (!member || !['administrator', 'creator'].includes(member.status)) {
    return;
  }

  if (command === 'start') {
    if (isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Сбор уже запущен!').catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
    } else {
      isRecruitmentOpen = true;
      participants = {};
      bot
        .sendMessage(
          chatId,
          'Набор на матч начался! Напиши "+", "-", "?" для взаимодействия.'
        )
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
    }
  } else if (command === 'close') {
    if (!isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Сбор ещё не начинался.').catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
    } else {
      isRecruitmentOpen = false;
      const nextWednesday = getNextWednesday(); // Получаем следующую среду
      const formattedDate = format(nextWednesday, 'yyyy-MM-dd');
      updateParticipantCount(chatId);
      bot
        .sendMessage(
          chatId,
          `Сбор завершён! Следующий набор будет ${formattedDate}.`
        )
        .catch((err) => {
          console.error('Ошибка при отправке сообщения:', err);
        });
    }
  }
});

// Автоматическое открытие и закрытие набора
schedule.scheduleJob({ dayOfWeek: 3, hour: 12, minute: 0 }, () => {
  isRecruitmentOpen = true;
  participants = {};
  bot
    .sendMessage(
      groupChatId,
      'Набор на матч начался! Записывайтесь и зовите друзей!'
    )
    .catch((err) => {
      console.error('Ошибка при отправке сообщения:', err);
    });
});
// Сброс состава.
schedule.scheduleJob({ dayOfWeek: 5, hour: 21, minute: 30 }, () => {
  isRecruitmentOpen = false;
  updateParticipantCount(groupChatId);
  const nextWednesday = getNextWednesday(); // Получаем следующую среду
  const formattedDate = format(nextWednesday, 'yyyy-MM-dd');
  bot
    .sendMessage(
      groupChatId,
      `Состав был сброшен! Следующий набор откроется в среду ${formattedDate} в 12:00.`
    )
    .catch((err) => {
      console.error('Ошибка при отправке сообщения:', err);
    });
});

// Выводим список игроков перед футболом
schedule.scheduleJob({ dayOfWeek: 5, hour: 19, minute: 30 }, () => {
  const updateParticipantCountTotal = updateParticipantCount();
  const message = `Футбол скоро начнется...
${updateParticipantCountTotal.total}
  `;
  bot
    .sendMessage(groupChatId, message.trimStart(), { parse_mode: 'HTML' })
    .catch((err) => {
      console.error('Ошибка при отправке сообщения:', err);
    });
});

schedule.scheduleJob({ dayOfWeek: 5, hour: 14, minute: 0 }, () => {
  // Создаем пустую строку для хранения тегов пользователей
  let taggedUsers = '';

  // Проходимся по всем участникам
  for (let userId in participants) {
    const participant = participants[userId];

    // Если статус участника "Под вопросом", то добавляем его тег в строку
    if (participant.status === 'Под Вопросом') {
      taggedUsers += `@${participant.userName} `;
    }
  }

  // Если есть хотя бы один участник со статусом "Под вопросом"
  if (taggedUsers) {
    // Отправляем сообщение с тегами этих участников
    bot
      .sendMessage(
        groupChatId,
        `${taggedUsers}\nУважаемые игроки, скоро начнется футбол!\nПрошу дать окончательный ответ по участию в сегодняшней игре. Спасибо 😊`
      )
      .catch((err) => {
        console.error('Ошибка при отправке сообщения:', err);
      });
  } else {
    // Если никого не нужно тегать, можно отправить другое сообщение или ничего не делать
    console.log('Нет игроков со статусом "Под вопросом"');
  }
});
