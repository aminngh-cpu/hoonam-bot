const { Telegraf } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9000 });

bot.start((ctx) => ctx.reply("سلام! ربات وصله ✅"));
bot.command("ping", (ctx) => ctx.reply("pong ✅"));

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const tgSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (WEBHOOK_SECRET && tgSecret !== WEBHOOK_SECRET) {
      return res.status(401).send("unauthorized");
    }
    await bot.handleUpdate(req.body);
    return res.status(200).send("OK");
  }

  return res.status(200).send("webhook alive");
};
