# 炸金花 Online

一个基于 Next.js、TypeScript 和 Socket.IO 开发的在线炸金花游戏。

## 项目简介

这是我的个人练手项目。

最初只是为了学习 Next.js 和 TypeScript，后来逐步扩展成一个支持：

- 本地单机模式
- AI 对战
- 多人联网房间
- 比牌
- 全下
- 音效系统
- 响应式桌面/移动端布局

的完整小游戏。

项目仍在持续开发中。

---

## 技术栈

### 前端

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS

### 实时通信

- Socket.IO

### 状态管理

- React Hooks

### 部署

- Node.js
- Vercel（计划支持）

---

## 当前功能

### 游戏玩法

- [x] 创建房间
- [x] 加入房间
- [x] AI 玩家
- [x] 看牌
- [x] 跟注
- [x] 加注
- [x] 弃牌
- [x] 比牌
- [x] 全下
- [x] 自动结算

### 用户体验

- [x] 音效系统
- [x] Toast 提示
- [x] 比牌弹窗
- [x] 响应式布局
- [x] 桌面端支持
- [x] 移动端支持

---

## 本地运行

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

---

## 项目结构

```text
src/
├── app/
├── components/
├── game/
├── hooks/
├── server/
├── sounds/
└── types/
```

---

## 开发路线图

### v0.8

- 行动倒计时
- 发牌动画
- 筹码动画

### v0.9

- 断线重连
- 房主转移
- 托管模式

### v1.0

- 公网部署
- 邀请链接
- 多人在线体验优化

---

## License

MIT License