const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');

// Токен бота
const token = '7940293074:AAEdq8SHUTk0wsq9qB0AYJcG9_F_S_thJug';
const bot = new TelegramBot(token, { polling: true });

// Переменная для хранения groupChatId
let groupChatId = 462397585;

// Состояние бота и участники
let isRecruitmentOpen = false;
let participants = {};

// Слушаем сообщения и сохраняем chatId
bot.on('message', (msg) => {
  if (!groupChatId && msg.chat && msg.chat.id) {
    groupChatId = msg.chat.id;
    bot.sendMessage(groupChatId, 'Бот настроен для работы с этим чатом!');
  }
});

function handleChatMemberEvents(msg) {
  const chatId = msg.chat.id;

  // Обработка новых членов чата
  if (msg.new_chat_members) {
    const newUsers = msg.new_chat_members;
    newUsers.forEach((newUser) => {
      bot.sendMessage(
        chatId,
        `Привет, ${newUser.first_name}! Добро пожаловать в группу!`
      );
    });
  }

  // Обработка запроса на вступление в группу (например, через ссылку)
  if (msg.chat_join_request) {
    const joinRequest = msg.chat_join_request;

    if (joinRequest) {
      const userId = joinRequest.from.id;
      bot.approveChatJoinRequest(chatId, userId);

      // Сообщение после принятия запроса
      bot.sendMessage(
        chatId,
        `Пользователь ${joinRequest.from.first_name} присоединился к группе.`
      );
    }
  }
}

// Слушаем события: новые участники и запросы на вступление
bot.on('new_chat_members', handleChatMemberEvents);
bot.on('chat_join_request', handleChatMemberEvents);

// Функция обновления общего количества участников
function updateParticipantCount(chatId) {
  let statusList = 'Состав:\n';
  let totalParticipants = 0;
  let readyCounter = 0; // Счётчик для участников в составе

  for (let userId in participants) {
    const participant = participants[userId];
    const invitedFriends = participant.invitedFriends || 0;

    if (participant.status === 'Готов') {
      readyCounter += 1; // Увеличиваем счётчик
      totalParticipants += 1 + invitedFriends; // Учитываем участника и его друзей
      statusList += `${readyCounter}. ${participant.name} — Готов(а) ( Позвал(а) ${invitedFriends} )\n`;
    } else if (participant.status === 'Под Вопросом') {
      totalParticipants += invitedFriends; // Только друзья
      statusList += `${participant.name} — Под Вопросом ( Позвал(а) ${invitedFriends} )\n`;
    } else if (invitedFriends > 0) {
      statusList += `${participant.name} — Не участвует, но позвал(а) ${invitedFriends}\n`;
      totalParticipants += invitedFriends;
    }
  }

  if (totalParticipants >= 15) {
    bot.sendMessage(
      chatId,
      'Внимание, количество участников составляет 15 человек!'
    );
  }

  let total = statusList + `\nИтого: ${totalParticipants}`;
  return total;
}

// Обработка команд +, -, ?
bot.onText(/(\+|-|\?)(\d+)?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name + ' ' + (msg.from.last_name || '');
  const symbol = match[1];
  const number = parseInt(match[2], 10) || 0;

  // Создаём участника, если он ещё не зарегистрирован
  if (!participants[userId]) {
    participants[userId] = {
      name: userName,
      status: 'Не участвует',
      invitedFriends: 0,
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
      bot.sendMessage(chatId, 'Нельзя добавить 0 человек.');
      return;
    }

    if (!isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!');
      return;
    }
    // if (number > 5) {
    //   bot.sendMessage(
    //     chatId,
    //     `${userName}, ты можешь позвать не больше 5 друзей`
    //   );
    //   return;
    // }

    if (participant.status === 'Готов') {
      if (number > 0) {
        // Добавление друзей, если статус "Готов"
        participant.invitedFriends += number;
        bot.sendMessage(chatId, `${userName} позвал(а) +${number}`);
      } else {
        // Если просто "+" и статус "Готов", выводим сообщение
        bot.sendMessage(chatId, 'Ты уже в составе');
        return;
      }
    } else {
      // Если пользователь не в составе, записываем его в состав
      if (number > 0) {
        // Добавление друзей
        participant.invitedFriends += number;
        bot.sendMessage(chatId, `${userName} позвал(а) +${number}`);
      } else {
        // Запись в состав
        participant.status = 'Готов';
        bot.sendMessage(chatId, `${userName} добавлен(а) в состав.`);
      }
    }
  } else if (symbol === '-') {
    const plusPattern = /^\-\d*$/; // Регулярное выражение: "-" или "-число"
    if (!plusPattern.test(msg.text.trim())) {
      return; // Игнорируем, если сообщение не соответствует формату
    }

    const number =
      msg.text.trim() === '-' ? 0 : parseInt(msg.text.slice(1), 10);

    if (number === 0 && msg.text.trim() !== '-') {
      bot.sendMessage(chatId, 'Нельзя убрать 0 человек.');
      return;
    }
    if (!isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!');
      return;
    }

    if (number > 0) {
      // Удаление друзей
      if (participant.invitedFriends < number) {
        // Если число больше количества друзей
        bot.sendMessage(
          chatId,
          `${userName}, ты не звал так много друзей! Ты можешь убрать ${participant.invitedFriends}`
        );
      } else {
        // Уменьшение количества друзей
        participant.invitedFriends -= number;
        bot.sendMessage(chatId, `${userName} сделал(а) -${number}.`);
      }
    } else {
      // Удаление из состава
      if (participant.status === 'Не участвует') {
        // Если пользователь уже не в составе
        bot.sendMessage(chatId, `${userName}, тебя и так нет в составе.`);
      } else {
        // Удаление пользователя из состава
        participant.status = 'Не участвует';
        bot.sendMessage(chatId, `${userName} убран(а) из состава.`);
      }
    }
  } else if (symbol === '?') {
    if (msg.text.trim() !== '?') {
      return; // Если это не строго "+", ничего не делаем
    }
    if (!isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!');
      return;
    }
    // Изменение статуса на "Под вопросом"
    if (participant.status === 'Под Вопросом') {
      bot.sendMessage(chatId, `${userName}, ты уже под вопросом.`);
    } else {
      participant.status = 'Под Вопросом';
      bot.sendMessage(
        chatId,
        `${userName} изменил(а) статус на "Под Вопросом".`
      );
    }
  }

  // Обновляем состав
  updateParticipantCount(chatId);
});

// Обработка команды Состав
bot.onText(/Состав/, (msg) => {
  const chatId = msg.chat.id;
  const pattern = /^Состав$/;

  if (!pattern.test(msg.text.trim())) {
    return; // Игнорируем, если сообщение не соответствует формату
  }
  if (!isRecruitmentOpen) {
    bot.sendMessage(chatId, 'Набор пока закрыт. Жди уведомления!');
    return;
  }
  bot.sendMessage(chatId, updateParticipantCount());
});

// Обработка команды /info
bot.onText(/Инструкция/, sendInfoMessage);

// Административные команды
bot.onText(/\/(start|close)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = match[1];

  const member = await bot.getChatMember(chatId, userId);
  if (!['administrator', 'creator'].includes(member.status)) {
    bot.sendMessage(chatId, 'Эта команда доступна только администратору!');
    return;
  }

  if (command === 'start') {
    if (isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Сбор уже запущен!');
    } else {
      isRecruitmentOpen = true;
      participants = {};
      bot.sendMessage(
        chatId,
        'Набор на матч начался! Напиши "+", "-" или "?" для взаимодействия.'
      );
    }
  } else if (command === 'close') {
    if (!isRecruitmentOpen) {
      bot.sendMessage(chatId, 'Сбор ещё не начинался.');
    } else {
      isRecruitmentOpen = false;
      updateParticipantCount(chatId);
      bot.sendMessage(chatId, 'Сбор завершён! Следующий набор будет в среду.');
    }
  }
});

// Автоматическое открытие и закрытие набора
schedule.scheduleJob({ dayOfWeek: 3, hour: 12, minute: 0 }, () => {
  isRecruitmentOpen = true;
  participants = {};
  bot.sendMessage(
    groupChatId,
    'Набор на матч начался! Записывайтесь и зовите друзей!'
  );
});

schedule.scheduleJob({ dayOfWeek: 5, hour: 23, minute: 59 }, () => {
  isRecruitmentOpen = false;
  updateParticipantCount(groupChatId);
  bot.sendMessage(
    groupChatId,
    'Состав был сброшен! Следующий набор откроется  в среду в 12:00.'
  );
});

function sendInfoMessage(msg) {
  const chatId = msg.chat.id;
  const infoMessage = `
Добро пожаловать! ⚽
"+" — записаться на матч.
"-" — отменить запись.
"+число" (напр., "+3") — добавить друзей.
"-число" (напр., "-2") — убрать добавленных друзей.
"?" — статус "Под вопросом".
"/info" — информация о возможностях бота.
"Состав" — посмотреть текущий состав.
  `;
  bot.sendMessage(chatId, infoMessage);
}
