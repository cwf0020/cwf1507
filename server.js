/**
 * 蔡文锋业绩工作台 — 可写小后端（零依赖，纯 Node 内置模块）
 *
 * 功能：
 *  - GET  /                -> 工作台单文件 HTML（与仓库根目录的「蔡文锋个人工作台.html」同源）
 *  - GET  /ops.json        -> 返回最新业绩报告 JSON {html,date,updatedAt}（工作台默认同步地址）
 *  - GET  /api/ops         -> 同上（别名）
 *  - POST /api/ops         -> 写入最新报告（需 token），body 支持 JSON {html,date} 或纯文本 HTML
 *  - POST /ops.json        -> 同上（别名，方便脚本统一写）
 *  - GET  /api/data        -> 返回用户数据 JSON {打新提醒,打金币,_updatedAt}（工作台云同步读取）
 *  - POST /api/data        -> 合并写入用户数据（需 token，按主键「代码/日期」合并，不丢数据）
 *
 * 报告持久化在 ./data/ops.json；用户数据持久化在 ./data/workbench.json，重启不丢。
 * 运行：node server.js   （PORT / OPS_TOKEN 可用环境变量覆盖）
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "3000", 10);
const OPS_TOKEN = process.env.OPS_TOKEN || "cwf-ops-2026";
const MAX_BODY = 12 * 1024 * 1024; // 12MB 上限，足够容纳含图表的报告

const __dirnameLocal = __dirname;
const DATA_DIR = path.join(__dirnameLocal, "data");
const DATA_FILE = path.join(DATA_DIR, "ops.json");
// 工作台 HTML：优先同目录副本，其次仓库根（部署结构无关）；都没有则降级为状态页
const WORKBENCH_CANDIDATES = [
  path.join(__dirnameLocal, "蔡文锋个人工作台.html"),
  path.join(__dirnameLocal, "..", "蔡文锋个人工作台.html"),
];
const WORKBENCH_FILE = WORKBENCH_CANDIDATES.find((f) => fs.existsSync(f)) || null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadReport() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("[loadReport] 读取失败:", e.message);
  }
  return null;
}
function saveReport(rep) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(rep, null, 2), "utf8");
}

// ---------- 用户数据（打新提醒 / 打金币）云同步 ----------
const WB_FILE = path.join(DATA_DIR, "workbench.json");
function loadWB() {
  try {
    if (fs.existsSync(WB_FILE)) {
      const raw = fs.readFileSync(WB_FILE, "utf8");
      const j = JSON.parse(raw);
      return { 打新提醒: j["打新提醒"] || [], 打金币: j["打金币"] || [], _updatedAt: j._updatedAt || null };
    }
  } catch (e) {
    console.error("[loadWB] 读取失败:", e.message);
  }
  return { 打新提醒: [], 打金币: [], _updatedAt: null };
}
function saveWB(wb) {
  ensureDataDir();
  fs.writeFileSync(WB_FILE, JSON.stringify(wb, null, 2), "utf8");
}
// 按主键合并两个数组：相同主键保留 _ts 较新者；不同主键全部保留（用于双向同步不丢数据）
function mergeArr(local, remote, key) {
  const map = new Map();
  const add = (it) => {
    if (!it || it[key] == null) return;
    const prev = map.get(it[key]);
    if (!prev) { map.set(it[key], it); return; }
    const lt = it._ts || 0, pt = prev._ts || 0;
    if (lt >= pt) map.set(it[key], it);
  };
  (local || []).forEach(add);
  (remote || []).forEach(add);
  return [...map.values()];
}

async function handlePostData(req, res) {
  const token = getToken(req, new URL(req.url, "http://localhost"));
  if (token !== OPS_TOKEN) {
    sendJSON(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let body;
  try { body = await readBody(req); } catch (e) { sendJSON(res, 413, { ok: false, error: e.message }); return; }
  let j;
  try { j = JSON.parse(body); } catch (e) { sendJSON(res, 400, { ok: false, error: "invalid json" }); return; }
  console.error("[POST /api/data] bodyLen=", body.length, "keys=", Object.keys(j), "bonds=", (j["打新提醒"]||[]).length, "coins=", (j["打金币"]||[]).length);
  const cur = loadWB();
  const wb = {
    打新提醒: mergeArr(cur["打新提醒"], j["打新提醒"], "代码"),
    打金币: mergeArr(cur["打金币"], j["打金币"], "日期"),
    _updatedAt: new Date().toISOString(),
  };
  try { saveWB(wb); } catch (e) { sendJSON(res, 500, { ok: false, error: e.message }); return; }
  console.log("[POST /api/data] 合并完成 bonds=", wb["打新提醒"].length, "coins=", wb["打金币"].length);
  sendJSON(res, 200, { ok: true, _updatedAt: wb._updatedAt, 打新提醒: wb["打新提醒"], 打金币: wb["打金币"] });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-ops-token",
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function getToken(req, url) {
  // token 支持 query (?token=) 或 header (x-ops-token)
  const q = url.searchParams.get("token");
  if (q) return q;
  return req.headers["x-ops-token"] || "";
}

async function handlePostOps(req, res) {
  const token = getToken(req, new URL(req.url, "http://localhost"));
  if (token !== OPS_TOKEN) {
    sendJSON(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    sendJSON(res, 413, { ok: false, error: e.message });
    return;
  }
  const ct = (req.headers["content-type"] || "").toLowerCase();
  let html = "";
  let date = "";
  if (ct.indexOf("application/json") >= 0) {
    try {
      const j = JSON.parse(body);
      html = j.html || "";
      date = j.date || "";
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: "invalid json" });
      return;
    }
  } else {
    html = body;
  }
  if (!html || html.trim().length < 20) {
    sendJSON(res, 400, { ok: false, error: "empty report" });
    return;
  }
  const rep = {
    html,
    date: date || new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
  try {
    saveReport(rep);
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: e.message });
    return;
  }
  console.log("[POST /api/ops] 报告已写入, date=", rep.date);
  sendJSON(res, 200, { ok: true, updatedAt: rep.updatedAt, date: rep.date });
}

function serveWorkbench(res) {
  if (!WORKBENCH_FILE) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><meta charset="utf-8"><title>数据同步后端</title>' +
      '<h2>蔡文锋工作台 · 数据同步后端</h2>' +
      '<p>这是云端双向同步接口服务（<code>/api/data</code>）。工作台入口请访问你部署的静态站点。</p>'
    );
    return;
  }
  try {
    const html = fs.readFileSync(WORKBENCH_FILE, "utf8");
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(html);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("工作台 HTML 未找到：" + WORKBENCH_FILE);
  }
}

function serveStatic(res, urlPath) {
  // 兜底静态文件（public 目录），防止未来扩展
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirnameLocal, "public", safe);
  if (!filePath.startsWith(path.join(__dirnameLocal, "public"))) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // 报告读取（两个别名）
  if ((p === "/ops.json" || p === "/api/ops") && req.method === "GET") {
    const rep = loadReport();
    if (!rep) {
      sendJSON(res, 404, { ok: false, error: "no report yet" });
      return;
    }
    sendJSON(res, 200, rep);
    return;
  }

  // 报告写入（两个别名，需 token）
  if ((p === "/api/ops" || p === "/ops.json") && req.method === "POST") {
    return handlePostOps(req, res);
  }

  // 用户数据云同步（读取 / 合并写入）
  if (p === "/api/data" && req.method === "GET") {
    const wb = loadWB();
    sendJSON(res, 200, wb);
    return;
  }
  if (p === "/api/data" && req.method === "POST") {
    return handlePostData(req, res);
  }

  // 工作台首页
  if (p === "/" || p === "/index.html") {
    return serveWorkbench(res);
  }

  // 兜底静态
  return serveStatic(res, p);
});

ensureDataDir();
server.listen(PORT, () => {
  console.log("蔡文锋业绩工作台后端已启动");
  console.log("  工作台:   http://localhost:" + PORT + "/");
  console.log("  报告读取: http://localhost:" + PORT + "/ops.json");
  console.log("  报告写入: POST http://localhost:" + PORT + "/api/ops?token=" + OPS_TOKEN);
  console.log("  数据同步: GET/POST http://localhost:" + PORT + "/api/data?token=" + OPS_TOKEN);
  const rep = loadReport();
  console.log(rep ? "  已有报告: date=" + rep.date : "  暂无报告（等待自动化 POST）");
});
