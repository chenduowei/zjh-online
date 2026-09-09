# 开服清单（P0）

每次给朋友玩之前，按顺序做。约 2 分钟。

## 启动

1. **启动游戏服务**（窗口 A，不要关）
   ```powershell
   cd D:\zjh-online
   npm start
   ```
2. 本机打开 http://localhost:3000 ，确认能进大厅。

3. **启动 Natapp**（窗口 B，不要关）
   - 双击 `C:\Users\Administrator\run_natapp.bat`
   - 或：`C:\Users\Administrator\natapp.exe -authtoken=你的token`

4. 在 Natapp 窗口找到：
   ```text
   Tunnel Status    Online
   Forwarding       http://xxxxxx.natappfree.cc -> http://127.0.0.1:3000
   ```
5. **只复制当前这一行的公网地址**发给朋友（免费域名会变，不要用旧链接）。

## 发给朋友时附带说明

```text
链接：（粘贴当前 Natapp 地址）
- 单机：打开后点「单机对战」
- 联网：一人创建房间，另一人加入并输入房间码
- 需我电脑在线；我若关机或断网，房间会断开
- 请尽量不要频繁刷新页面
```

## 关闭

1. 朋友都结束后，Natapp 窗口 Ctrl+C（或关窗口）
2. `npm start` 窗口 Ctrl+C

## 安全

- **authtoken 不要发到公开群 / 截图长期留存**（等于隧道钥匙）
- 若 token 已泄露：登录 https://natapp.cn → 我的隧道 → 重置或新建免费隧道，并更新 `run_natapp.bat` 里的 token

## 故障快查

| 现象 | 处理 |
|------|------|
| 公网 not found | 看 Natapp 是否 Online；用**最新** Forwarding 地址 |
| 502 / 打不开 | 先确认 localhost:3000 正常 |
| 联网不同步 | 双方用同一公网链接；创建方不要刷新丢房 |
| 端口占用 | 关掉其它占用 3000 的程序后重开 `npm start` |
