# 炸金花 Online — 免费尽快上线（兼顾国内访问）

目标：**零费用、尽快有公网链接、国内尽量能打开且不太慢**。  
单机 AI + 联网房间同一服务。

> 现实说明：永久免费 + 国内和专线一样快，几乎不存在。  
> 下面是目前性价比最好的组合。

---

## 推荐顺序

| 优先级 | 平台 | 费用 | 国内体验 | 速度 |
|--------|------|------|----------|------|
| ① | **Zeabur** | 每月免费额度 | 较好（可直连） | 中上 |
| ② | **Render（新加坡）** | 永久免费档 | 一般 | 中 |
| ③ | 腾讯云轻量试用 | 新用户常有免费时长 | 最好 | 快 |

**先做 ① Zeabur**，当天就能分享链接。

---

## ① Zeabur（首选，约 10～15 分钟）

### 准备代码

在 PowerShell：

```powershell
cd D:\zjh-online

# 若还没装依赖 / 没构建过，先本地确认一次
npm install --registry https://registry.npmjs.org
npm run build

# 推到 GitHub（没有仓库就先到 github.com 新建一个空仓库）
git init
git add .
git commit -m "ready for deploy"
git branch -M main
git remote add origin https://github.com/你的用户名/zjh-online.git
git push -u origin main
```

（若 `git` 提示未配置用户，先执行：）

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
```

### 在 Zeabur 部署

1. 打开：**https://zeabur.com**（中文界面，一般不用翻墙）
2. 用 **GitHub** 登录并授权
3. **新建项目** → **从 GitHub 导入** → 选 `zjh-online`
4. 添加服务时选 **你的仓库**，部署方式：
   - 有 Dockerfile 会自动识别；或选 Node
5. 若需手动填：
   - **构建命令：** `npm install --registry https://registry.npmjs.org && npm run build`
   - **启动命令：** `node --experimental-strip-types server.mjs`
6. 环境变量：
   - `NODE_ENV` = `production`
   - `PORT` = `3000`（若平台自动注入可不管）
7. 等构建成功 → **生成域名**（例如 `zjh-online-xxxx.zeabur.app`）

打开该链接即可：

- **单机：**「单机对战 · AI」
- **联网：**两人打开同一链接，一人创建房间、一人加入

免费额度用完后服务可能暂停，属平台规则；个人试用通常够用。

---

## ② Render 新加坡（备选，更“永久免费”）

1. 代码已在 GitHub（同上）
2. 打开 **https://render.com** → 用 GitHub 登录
3. **New → Web Service** → 选仓库
4. 填写：
   - **Region：** Singapore
   - **Runtime：** Node
   - **Build Command：**  
     `npm install --registry https://registry.npmjs.org && npm run build`
   - **Start Command：**  
     `node --experimental-strip-types server.mjs`
   - **Plan：** Free
5. Environment：
   - `NODE_VERSION` = `22`
   - `NODE_ENV` = `production`
6. Deploy 后得到 `https://xxx.onrender.com`

注意：免费机约 15 分钟无访问会**休眠**，下次打开要等 30～60 秒冷启动。国内访问通常比 Zeabur 慢一些。

也可用仓库里的 `render.yaml`：New → Blueprint。

---

## ③ 以后想国内更快（仍可能免费试用）

腾讯云 / 阿里云 **轻量应用服务器** 新用户常有免费或低价时长：

```bash
docker build -t zjh-online .
docker run -d -p 3000:3000 -e NODE_ENV=production zjh-online
```

访问 `http://公网IP:3000`。这是国内延迟最低的做法，但要实名，且试用结束可能收费。

---

## 上线检查清单

- [ ] 本地 `npm run build` 成功  
- [ ] 本地 `npm start` 能打开，单机可玩  
- [ ] 两个浏览器窗口能创建/加入房间  
- [ ] 平台环境为 **Node 22**  
- [ ] 启动命令是 **`server.mjs`**（不是 `next start`，否则联网不可用）

---

## 常见问题

**联网提示超时？**  
启动命令必须是 `node --experimental-strip-types server.mjs`。

**构建失败 Node 版本？**  
在平台设置 Node **22**。

**Zeabur/Render 打不开？**  
等 1～2 分钟冷启动；或换浏览器 / 关代理再试。

**只想给朋友玩单机？**  
仍部署完整版即可，对方不点「创建房间」就只玩 AI。
