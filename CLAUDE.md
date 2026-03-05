# CLAUDE.md

本文件为 Claude Code（claude.ai/code）提供在此代码库中工作的指导。

## 项目概述

这是一个支持多路由的 noVNC 代理服务器，通过 `config.json` 配置多个 VNC 端点。项目使用 Express.js 提供 Web 界面，通过 WebSocket 代理 VNC 连接。

## 常用命令

### 安装依赖
```bash
npm install
```

### 启动服务器
```bash
npm start
```

服务器默认运行在 `0.0.0.0:8080`，可通过环境变量 `BIND_ADDR` 和 `BIND_PORT` 或 `PORT` 自定义。

### 下载 noVNC
项目依赖手动下载的 noVNC 前端文件。如果 `noVNC/` 目录不存在，运行：
```bash
git clone https://github.com/novnc/noVNC.git
# 如果需要特定版本，切换到标签（例如 v1.6.0）：
# cd noVNC && git checkout v1.6.0
```

或下载其他版本，确保目录名为 `noVNC`。

> **注意**：如果之前使用 tar 包下载并已存在 `novnc` 目录，可以将其重命名为 `noVNC` 或删除后重新克隆。

## 项目架构

### 核心文件
- `server.js` - 主服务器文件，包含 Express 应用和 WebSocket 代理逻辑
- `config.json` - VNC 服务器配置（IP、端口、密码、路由路径）
- `package.json` - 项目依赖和脚本

### 配置说明
`config.json` 是一个 JSON 数组，每个对象包含：
- `ip` - VNC 服务器 IP 地址
- `port` - VNC 服务器端口
- `passwd` - VNC 密码（可选）
- `route` - 访问路径（以 `/` 开头）

示例配置见 `example.json`。

### 工作原理
1. **静态文件服务**：为每个路由提供 noVNC 前端文件（`${route}/novnc/` 指向 `noVNC/` 目录）
2. **HTML 模板注入**：修改 `vnc.html` 中的资源路径，注入自动连接配置脚本
3. **WebSocket 代理**：将客户端 WebSocket 连接转发到对应的 VNC 服务器 TCP 连接

### WebSocket 路由匹配
服务器支持多种 WebSocket 路径匹配方式：
1. 直接路径：`/${route}/ws`
2. 默认路径：`/websockify`（通过 Referer、Origin 或查询参数自动路由）
3. 通用匹配：从 Referer 头、URL 查询参数等推断路由

### 环境变量
- `BIND_ADDR` - 服务器监听地址（默认：`0.0.0.0`）
- `BIND_PORT` - 服务器监听端口（默认：`8080`）
- `PORT` - 备用端口配置（优先级低于 `BIND_PORT`）

## 开发注意事项

### 配置热重载
当前配置在启动时加载，修改 `config.json` 后需要重启服务器。

### noVNC 版本兼容性
项目依赖 noVNC 的 `vnc.html` 模板文件结构。如果升级 noVNC 版本，可能需要调整 `server.js` 中的路径替换逻辑。

### WebSocket 代理逻辑
WebSocket 代理在 `server.js` 的 `wss.on('connection', ...)` 中实现，包含复杂的路由匹配逻辑。修改时需确保所有匹配情况都被覆盖。

### 静态文件路径
noVNC 前端文件通过 Express 静态中间件提供，路径前缀为 `${route}/novnc`。HTML 模板中的资源路径会被动态替换以匹配此前缀。

## 测试与调试

项目目前没有内置测试套件。调试时：
- 查看服务器控制台输出的连接日志
- 检查浏览器控制台的 JavaScript 错误
- 验证 WebSocket 连接是否成功建立

## 扩展建议

如需添加新功能：
1. 配置热重载：添加 `fs.watch` 监听 `config.json` 变化
2. 健康检查端点：添加 `/health` 等端点
3. 认证中间件：在路由前添加身份验证
4. HTTPS 支持：配置 SSL 证书

---

*最后更新：2026-03-05*