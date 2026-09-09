# 炸金花 Online

单机 AI + 多人联网（Socket.IO）同一套服务。

## 本地开发

```bash
npm install --registry https://registry.npmjs.org
npm run dev          # 仅前端热更新（单机可用）
npm run dev:online   # 单机 + 联网
```

## 生产

```bash
npm run build
npm start            # 单机 + 联网
```

部署说明见 **DEPLOY.md**（Render / Railway / Docker / 腾讯云）。

开服步骤见 **OPEN_SERVER.md**。P0/P1：状态条、手机布局、牌力 AI、刷新提示。
