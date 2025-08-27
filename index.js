/* کد نهایی — تلگرام + گوگل‌شیت (Vercel) */
const { Telegraf, Markup, Scenes, session } = require("telegraf");
const { google } = require("googleapis");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "dev-secret";
const SHEET_ID = process.env.SHEET_ID;
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

if (!BOT_TOKEN || !SHEET_ID || !process.env.GOOGLE_CREDENTIALS) {
  console.error("Missing ENV(s). Required: BOT_TOKEN, SHEET_ID, GOOGLE_CREDENTIALS");
}

const DEVICES = [
  "لودر مگنت‌دار هیوندای",
  "لودر مگنت‌دار",
  "لودر با چنگ",
  "کمپرسی بشیری",
  "کمپرسی معینی",
  "لودر ملکی هونام"
];
const PROJECT_NAME = "آماده‌سازی ایت هونام";
const SHIFT_NAME = "صبح";
const TZ = "Asia/Tehran";
const VERSION = "v1.0.0";

// ---------- Google Sheets ----------
function getAuth() {
  let creds;
  try {
    const raw = process.env.GOOGLE_CREDENTIALS.trim();
    creds = raw.startsWith("{") ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch (e) { console.error("Invalid GOOGLE_CREDENTIALS:", e); throw e; }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}
async function sheetsClient(){ return google.sheets({ version: "v4", auth: await getAuth() }); }
async function ensureHeaders(){
  const sh = await sheetsClient();
  const blocks = [
    { title:"DailyStatus", headers:["DateJalali","User","UserId","Device","TodayHours","FuelLiters","Project","Shift","Note","Timestamp"] },
    { title:"Breakdowns", headers:["DateJalali","User","UserId","Device","Category","Priority","Description","Timestamp"] }
  ];
  const meta = await sh.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets.map(s=>s.properties.title);
  for (const b of blocks){
    if (!existing.includes(b.title)){
      await sh.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests:[{ addSheet:{ properties:{ title:b.title }}}]}});
    }
    await sh.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${b.title}!A1:${String.fromCharCode(64 + b.headers.length)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [b.headers] }
    });
  }
}
function nowTehran(){ return new Date(new Date().toLocaleString("en-US",{ timeZone: TZ })); }
function toJalali(d){ // نمایش ساده yyyy-mm-dd (بعداً می‌تونیم کتابخانه شمسی اضافه کنیم)
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
async function appendRow(sheet, values){
  const sh = await sheetsClient();
  await sh.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheet}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] }
  });
}

// ---------- Bot ----------
const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9000 });

bot.use(async (ctx, next) => {
  if (ADMIN_IDS.length && ctx.from) {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) {
      return ctx.reply("⛔️ دسترسی ندارید.");
    }
  }
  await next();
});
bot.use(session());

// صحنه ثبت ساعت/سوخت
const reportScene = new Scenes.WizardScene(
  "report",
  async (ctx) => {
    ctx.session.form = { device:null, hours:null, liters:0, note:"" };
    const kb = DEVICES.map(d => [Markup.button.callback(d, `dev:${d}`)]);
    await ctx.reply("✅ دستگاه را انتخاب کنید:", Markup.inlineKeyboard(kb));
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data?.startsWith("dev:")){
      ctx.session.form.device = ctx.callbackQuery.data.slice(4);
      await ctx.answerCbQuery();
      await ctx.editMessageText(`دستگاه: ${ctx.session.form.device}\n\n⏱ چند ساعت کار امروز؟ (مثلاً ۸)`);
      return;
    }
    const n = Number(String(ctx.message?.text||"").replace(/[^\d.]/g,""));
    if (isFinite(n) && n>=0 && n<=16){
      ctx.session.form.hours = n;
      await ctx.reply("⛽️ چند لیتر گازوئیل؟ (اگر ندادید 0 بزنید)");
      return ctx.wizard.next();
    }
    await ctx.reply("ساعت نامعتبر. عدد بین 0 تا 16 ارسال کنید.");
  },
  async (ctx) => {
    const n = Number(String(ctx.message?.text||"").replace(/[^\d.]/g,""));
    if (isFinite(n) && n>=0 && n<=300){
      ctx.session.form.liters = n;
      await ctx.reply("📝 یادداشت کوتاه (اختیاری). اگر ندارید «-» بفرستید.");
      return ctx.wizard.next();
    }
    await ctx.reply("لیتر نامعتبر. عدد بین 0 تا 300 ارسال کنید.");
  },
  async (ctx) => {
    const note = String(ctx.message?.text||"").trim();
    ctx.session.form.note = (note === "-") ? "" : note;

    const t = nowTehran(), j = toJalali(t), f = ctx.session.form;
    const msg = `بازبینی:\n- دستگاه: ${f.device}\n- ساعت کار: ${f.hours}\n- سوخت: ${f.liters} لیتر\n- پروژه: ${PROJECT_NAME}\n- شیفت: ${SHIFT_NAME}\n${f.note?'- یادداشت: '+f.note+'\n':''}\nتأیید می‌کنید؟`;
    await ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.callback("✅ تأیید","r:ok"),Markup.button.callback("✏️ ویرایش","r:edit")]]));
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const d = ctx.callbackQuery.data; await ctx.answerCbQuery();
    if (d === "r:edit"){ ctx.wizard.selectStep(0); return ctx.reply("بیایید دوباره شروع کنیم."); }
    if (d === "r:ok"){
      const t = nowTehran(), j = toJalali(t), f = ctx.session.form;
      await ensureHeaders();
      await appendRow("DailyStatus", [ j, ctx.from.first_name||"", ctx.from.id, f.device, f.hours, f.liters, PROJECT_NAME, SHIFT_NAME, f.note, t.toISOString() ]);
      await ctx.reply("✅ ثبت شد. ممنون.");
      return ctx.scene.leave();
    }
  }
);

// صحنه خرابی
const brkScene = new Scenes.WizardScene(
  "break",
  async (ctx) => {
    ctx.session.brk = { device:null, category:"سایر", priority:"عادی", desc:"" };
    const kb = DEVICES.map(d => [Markup.button.callback(d, `dev:${d}`)]);
    await ctx.reply("⚠️ خرابی — دستگاه را انتخاب کنید:", Markup.inlineKeyboard(kb));
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data?.startsWith("dev:")){
      ctx.session.brk.device = ctx.callbackQuery.data.slice(4);
      await ctx.answerCbQuery();
      await ctx.editMessageText(`دستگاه: ${ctx.session.brk.device}\n\nدسته‌بندی خرابی؟ (مثل: هیدرولیک/برق/… یا «سایر»)`);
      return;
    }
    ctx.session.brk.category = (ctx.message?.text || "سایر").trim();
    await ctx.reply("اولویت؟ (بنویسید: بحرانی / فوری / عادی)");
    return ctx.wizard.next();
  },
  async (ctx) => {
    const p = (ctx.message?.text || "عادی").trim();
    ctx.session.brk.priority = ["بحرانی","فوری","عادی"].includes(p) ? p : "عادی";
    await ctx.reply("توضیح کوتاه خرابی را بنویسید.");
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.session.brk.desc = (ctx.message?.text || "").trim();
    const t = nowTehran(), j = toJalali(t), b = ctx.session.brk;
    await ensureHeaders();
    await appendRow("Breakdowns", [ j, ctx.from.first_name||"", ctx.from.id, b.device, b.category, b.priority, b.desc, t.toISOString() ]);
    await ctx.reply("🧾 خرابی ثبت شد. ممنون.");
    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage([reportScene, brkScene]);
bot.use(stage.middleware());

// دستورات
bot.start(async (ctx) => {
  await ctx.reply(`سلام ${ctx.from.first_name || ""} 👋\nیک گزینه را انتخاب کنید:`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📝 ثبت ساعت/سوخت","act:report")],
      [Markup.button.callback("⚠️ اعلام خرابی","act:break")],
      [Markup.button.callback("ℹ️ وضعیت","act:help")]
    ])
  );
});
bot.action("act:report",(ctx)=>ctx.scene.enter("report"));
bot.action("act:break",(ctx)=>ctx.scene.enter("break"));
bot.action("act:help", async (ctx)=>{ await ctx.answerCbQuery(); await ctx.reply("دستورات: /ping /whoami /version"); });
bot.command("ping",(ctx)=>ctx.reply("pong ✅"));
bot.command("whoami",(ctx)=>ctx.reply(`id: ${ctx.from.id}\nname: ${ctx.from.first_name || ""}`));
bot.command("version",(ctx)=>ctx.reply(`Hoonam Bot ${VERSION}`));
bot.on("text", async (ctx) => { if (!ctx.scene?.current) return ctx.reply("برای شروع /start را بزنید."); });

// ---------- Vercel HTTP Handler ----------
module.exports = async (req, res) => {
  try {
    if (req.url.startsWith("/ping")) return res.status(200).send("OK");
    if (req.url.startsWith("/whoami")) return res.status(200).json({ ok:true, ver:VERSION });
    if (req.url.startsWith("/version")) return res.status(200).send(VERSION);

    if (req.method === "POST" && req.url.startsWith("/webhook")) {
      const tgSecret = req.headers["x-telegram-bot-api-secret-token"];
      if (WEBHOOK_SECRET && tgSecret !== WEBHOOK_SECRET) return res.status(401).send("unauthorized");
      await bot.handleUpdate(req.body);
      return res.status(200).send("OK");
    }
    return res.status(200).send("Hoonam bot is running.");
  } catch (e) { console.error("Handler error:", e); return res.status(500).send("ERR"); }
};
