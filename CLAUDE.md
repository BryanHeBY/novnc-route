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

## Docker 部署

### 使用 Docker Compose（推荐）
```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 使用 Docker 直接运行
```bash
# 构建镜像
docker build -t novnc-proxy .

# 运行容器
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/config.json:/app/config.json:ro \
  --name novnc-proxy \
  novnc-proxy
```

### 环境变量
- `BIND_ADDR` - 服务器监听地址（默认：`0.0.0.0`）
- `BIND_PORT` - 服务器监听端口（默认：`8080`）
- `PORT` - 备用端口配置（优先级低于 `BIND_PORT`）
- `HOST_PORT` - Docker Compose 主机端口（默认：`8080`）

详细 Docker 使用说明请查看 [DOCKER-README.md](DOCKER-README.md)。

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
- `route` - 路由名称，无需以 `/` 开头

示例配置见 `example.json`。

### 工作原理
1. **静态文件服务**：从根路径统一提供 noVNC 前端文件，无需为每个路由配置前缀
2. **路由重定向**：当访问 `/vnc.html?route=xxx` 时，自动重定向到带完整连接参数的 noVNC 页面
3. **自动配置**：自动填充VNC主机、端口、密码、WebSocket路径等参数，实现无需手动输入一键连接
4. **WebSocket 代理**：将客户端 WebSocket 连接转发到对应的 VNC 服务器 TCP 连接

### WebSocket 路由匹配
服务器支持多种 WebSocket 路径匹配方式：
1. 路径参数：`/websockify/{route}`（优先级最高，最可靠）
2. 查询参数：`/websockify?route={route}`
3. 通用匹配：从 Referer 头、Cookie 等推断路由（兼容旧版）

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
noVNC 前端文件通过 Express 静态中间件直接从根路径提供，无需前缀。所有连接配置通过URL查询参数传递给noVNC原生处理，无需修改HTML模板。

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

*最后更新：2026-03-11（重构为查询参数路由，支持?vnc.html?route=xxx 访问方式）*