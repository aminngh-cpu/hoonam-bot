// index.js — smoke test (حداقلی و بدون وابستگی)
module.exports = async (req, res) => {
  console.log("REQ:", req.method, req.url);
  if (req.url.startsWith("/ping")) return res.status(200).send("OK");
  return res.status(200).json({ ok: true, msg: "vercel alive" });
};
