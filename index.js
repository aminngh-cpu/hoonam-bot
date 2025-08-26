const { Telegraf } = require('telegraf')

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.start((ctx) => ctx.reply('سلام! ربات وصل شد ✅'))
bot.on('text', (ctx) => ctx.reply(`پیامت رسید: ${ctx.message.text}`))

// برای Vercel لازم داریم اینو اکسپورت کنیم
module.exports = (req, res) => {
  bot.handleUpdate(req.body)
  res.status(200).send('OK')
}
