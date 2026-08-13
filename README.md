# 蔡文锋业绩工作台 · 可写小后端

零依赖（纯 Node 内置模块）的小后端，用于让「每日业绩分析自动化」把生成的 HTML 报告
POST 进来，工作台打开即自动同步展示（形态与飞书收到的完全一致）。

## 1. 本地运行

```bash
cd backend
node server.js
# 或 npm start
```

默认监听 `http://localhost:3000`，数据持久化在 `backend/data/ops.json`。

可用环境变量：
- `PORT`：端口（默认 3000）
- `OPS_TOKEN`：写入报告的令牌（默认 `cwf-ops-2026`，务必改成自己的）

## 2. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/`            | 工作台单文件 HTML（与仓库根「蔡文锋个人工作台.html」同源） |
| GET  | `/ops.json`    | 读取最新报告 JSON `{html,date,updatedAt}`（工作台默认同步地址） |
| GET  | `/api/ops`     | 同上（别名） |
| POST | `/api/ops`     | 写入报告（需 token）。body 支持 `application/json {html,date}` 或纯文本 HTML |
| POST | `/ops.json`    | 同上（别名） |

POST 示例：

```bash
curl -X POST "https://你的域名/api/ops?token=你的令牌" \
  -H "Content-Type: application/json" \
  -d '{"html":"<html>...</html>","date":"2026-08-12"}'
```

## 3. 让每日自动化把报告写进来

在 `automation-1785984463411`（蔡文锋个人业绩每日分析）原有「发飞书」步骤之后，
追加一段：把生成的报告 HTML 变量 POST 到上面的地址即可（保留飞书推送不变）。

示意（自动化里用 curl / HTTP 请求节点）：

```
POST https://你的域名/api/ops?token=你的令牌
Content-Type: application/json
Body: {"html": "<报告HTML>", "date": "YYYY-MM-DD"}
```

> 关键：工作台默认同步地址是同源 `/ops.json`，所以**把后端部署到公网、
> 用它的域名打开工作台**，手机/电脑打开即同步，全自动、零配置。

## 4. 部署到公网（三选一）

1. **本机 + 内网穿透**（临时/测试）：`node server.js` 后配合 ngrok / Cloudflare Tunnel /
   路由器端口映射，拿到公网域名。
2. **免费 Node 托管**（持久推荐）：Railway / Render / Fly.io / Koyeb，上传 `backend/`
   目录，`start` 命令填 `node server.js`，设好 `PORT` 与 `OPS_TOKEN` 环境变量。
3. **妙搭 full_stack**：本环境沙箱无法访问妙搭 git 主机，未能在此完成；
   若你本机网络可访问 `miaoda-git.feishu.cn`，可另择环境部署，逻辑等价。

## 5. 数据安全说明

- 报告仅存于后端 `data/ops.json`（服务端文件），不在任何第三方数据库。
- 工作台本身的数据（打新/打金币等）仍在你浏览器 localStorage，互不影响。
- token 只是防止误写，**不是加密**；公网部署务必改成强令牌并自行承担暴露风险。
