# 炸金花 Online

基于 Next.js 15 + React 19 + TypeScript + Socket.IO 的炸金花小游戏：单机 AI 对战 + 多人联网房间。

规则说明见 [RULES.md](./RULES.md)。

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2a. 单机模式（自己 + 2 个 AI）

```bash
npm run dev
```

打开 http://localhost:3000，直接开玩。

### 2b. 联网模式（和朋友同房对战）

**注意：联网必须用 `npm start`（或 `npm run dev:online`），只用 `npm run dev` 连不上房间。**

```bash
npm start
```

- 房主：打开页面 → 创建房间 → 把 6 位房间码发给朋友。
- 朋友：打开**同一个地址**（局域网用房主的内网 IP，如 `http://192.168.1.5:3000`）→ 输入房间码和昵称 → 加入。
- 房主点"开始游戏"。下一局由房主点"下一局"。
- 断线 5 分钟内重进房间可自动回座；30 秒不行动自动弃牌。

## 常用命令

| 命令              | 说明                          |
| ----------------- | ----------------------------- |
| `npm run dev`     | 单机开发模式（无 Socket 服务）|
| `npm run dev:online` | 联网开发模式               |
| `npm start`       | 联网生产模式                  |
| `npm test`        | 跑单测（40 个）               |
| `npm run build`   | 生产构建                      |

## 环境变量

| 变量           | 默认值 | 说明                                              |
| -------------- | ------ | ------------------------------------------------- |
| `PORT`         | 3000   | 监听端口                                          |
| `HOSTNAME`     | 0.0.0.0| 监听地址                                          |
| `CORS_ORIGIN`  | `*`    | 允许的前端来源，公网部署时收紧，如 `https://game.example.com,https://www.game.example.com` |

## Docker 部署

```bash
docker build -t zjh-online .
docker run -d -p 3000:3000 -e CORS_ORIGIN=https://你的域名 zjh-online
```

生产镜像只装生产依赖，体积约为原来的一半。

## 项目结构

```text
├── server.mjs            # Socket.IO 服务端（房间、超时托管、重连、限流）
├── src/
│   ├── app/              # Next.js 页面入口
│   ├── components/       # UI 组件（牌桌、座位、比牌弹窗等）
│   ├── game/
│   │   ├── engine.ts     # 牌局状态机（发牌/下注/比牌/边池结算）
│   │   ├── room.ts       # 房间与视角裁剪（防偷看、token 重连）
│   │   ├── rules.ts      # 牌型判定
│   │   ├── cards.ts deck.ts
│   │   └── __tests__/    # 单测
│   ├── hooks/
│   │   ├── useGame.ts    # 单机模式
│   │   └── useOnline.ts  # 联网模式（含断线自动重连）
│   └── lib/sound.ts      # 音效
├── RULES.md              # 规则说明（唯一规则依据）
├── ROADMAP.md            # 路线图
└── Dockerfile
```

## License

MIT License
