const { Telegraf } = require('telegraf');
const moment = require('moment');

const bot = new Telegraf('6017031770:AAHXjg8tTHKf9YFcKgWsecXqr6M6PqriDZ8');

const players = [];
let player = {};
let counter = null;
let alreadyPlayer = true;
let firendsPlayer = null;
let alreadyAdded = false;

bot.start((ctx) => {
  ctx.reply('Собираем состав на футбол.');
});

bot.on('message', (ctx) => {
  const message = ctx.message.text;

  if (message === '+') {
      player = {
      name: ctx.from.first_name + ' ' + ctx.from.last_name,
      id: ctx.from.id,
    };

    players.forEach((e) => {
      if (e.id === player.id) {
        alreadyAdded = true;
      }
    });

    console.log(players, alreadyAdded)
   

    if (!alreadyAdded ) {
      players.push(player);
      alreadyPlayer = true;
      ctx.reply(`✅ ${player.name} вписался в команду.`);
      if(firendsPlayer > 0) {
        counter=+ firendsPlayer;
        console.log(counter)
      }
      counter++;
      showPlayers(ctx);
      console.log(counter)
    } else {
      ctx.reply(`⚠️ ${player.name} уже записан на игру.`);
    }
  } 
  
  
  else if (message === '-') {
    const index = players.findIndex((p) => p.id === player.id);
    console.log(players)
    if (index === -1) {
      ctx.reply(`${player.name} не был записан в команду.`);
      return;
    }

    if(firendsPlayer > 0 && players.length === 0) {
      ctx.reply(`❌ ${player.name} выписался из команды.`);
      alreadyPlayer = false;
      players.splice(index, 1);
      counter = firendsPlayer;
      showPlayers(ctx);
      return
    }

    counter--;
    players.splice(index, 1);
    alreadyPlayer = false;
    ctx.reply(`❌ ${player.name} выписался из команды.`);
    showPlayers(ctx);

  } else if (message.startsWith('+')) {
    const parts = message.split('');
    if (parts.length === 2) {
      const number = parseInt(parts[1]);
      if (isNaN(number)) {
        console.log('Неверный формат команды.');
        return
      } 
      if(players.length === 0) {
        counter += number
        firendsPlayer += number;
        ctx.reply(`✅ ${ctx.from.first_name + ' ' + ctx.from.last_name} позвал + ${counter}.`);
        showPlayers(ctx);
        return
      }
        counter += number;
        firendsPlayer +=number;
        ctx.reply(`✅ ${player.name} позвал + ${counter - 1}.`);
        showPlayers(ctx);
    } else {
      ctx.reply('Неверный формат команды.');
    }
  } 
  else if (message.startsWith('-')) {
    const parts = message.split('');
    if (parts.length === 2) {
      const number = parseInt(parts[1]);
      if (isNaN(number)) {
        console.log('Неверный формат команды.');
        return
      } 
      if(firendsPlayer <= 0) {
        ctx.reply("Сначала нужно позвать друзей, чтобы их отзывать");
        return
      }
        counter -= number;
        firendsPlayer -=number;
        ctx.reply(`✅ ${ctx.from.first_name} отозвал  ${number}.`);
        showPlayers(ctx);
    } else {
      ctx.reply('Неверный формат команды.');
    }
  } 
  
  else if (message === 'Состав') {
    showPlayers(ctx);
  } else if (message === 'Сброс') {
    counter = 0;
    players.length = 0;
    ctx.reply('✅ Состав сброшен.');
  }
});

// // const checkTime = () => {
// //   const now = moment();
// //   const deadline = moment().day('tuesday').hour(12).minute(0);

// //   if (now.isAfter(deadline)) {
// //     bot.telegram.sendMessage(
// //       ctx.chat.id,
// //       '❗️Прием голосов на игру по футболу закрыт.❗️'
// //     );
// //     bot.stop();
// //   }
// // };

// setInterval(checkTime, 1000);

const showPlayers = (ctx) => {
  let text = `<strong>Состав </strong> ( ${counter} человек ): \n`;
  let playerAlready = alreadyPlayer ? 'Готов' : 'Не готов';
  let playerInfo = `<b>${ctx.from.first_name + ctx.from.last_name} ->>> ${playerAlready}</b>`;
  

  if(players.length === 0) {
    alreadyPlayer = false
    text += `<b>${playerInfo}</b> позвал ${firendsPlayer}`;
  }
  players.forEach((player) => {
    text += playerInfo;
    
    if(firendsPlayer > 0) {
      playerInfo = '';
      text += `${playerInfo} позвал + ${firendsPlayer}`
    }
    if(firendsPlayer < 0) {
      counter = player.length + firendsPlayer;
      text += `${playerInfo} позвал + ${counter}`
    }
  });
  ctx.telegram.sendMessage(ctx.chat.id, text, { parse_mode: 'HTML' });
};

const showPlayersAtWednesday = () => {
  const now = moment();
  const deadline = moment().day('wednesday').hour(19).minute(0);

  if (now.isAfter(deadline)) {
    bot.telegram.sendMessage(
      ctx.chat.id,
      `<b> Список участников игры по футболу </b>:\n\n` + players.join('\n')
    );
    bot.stop();
  }
};

setInterval(showPlayersAtWednesday, 1000);

bot.launch();
