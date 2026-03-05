# noVNC Proxy

一个支持多路由的 noVNC 代理服务器，通过 `config.json` 配置多个 VNC 端点。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 下载 noVNC

```bash
git clone https://github.com/novnc/noVNC.git
# 如果需要特定版本，切换到标签（例如 v1.6.0）：
# cd noVNC && git checkout v1.6.0
```

或者下载其他版本，确保目录名为 `noVNC`。

> **注意**：如果之前使用 tar 包下载并已存在 `novnc` 目录，可以将其重命名为 `noVNC` 或删除后重新克隆。

### 3. 配置 config.json

编辑 `config.json` 文件，添加你的 VNC 服务器：

```json
[
  {
    "ip": "127.0.0.1",
    "port": 5900,
    "passwd": "your_password",  // 可选：VNC 密码
    "route": "/desktop1"
  },
  {
    "ip": "192.168.1.100",
    "port": 5900,
    "passwd": "another_password",  // 可选：VNC 密码
    "route": "/desktop2"
  }
]
```

### 4. 启动服务器

```bash
npm start
```

服务器默认运行在 8080 端口。

### 5. 访问

在浏览器中打开：
- `http://localhost:8080/desktop1` 访问第一个 VNC 桌面
- `http://localhost:8080/desktop2` 访问第二个 VNC 桌面

## 配置说明

| 字段 | 说明 |
|------|------|
| ip | VNC 服务器 IP 地址 |
| port | VNC 服务器端口 |
| passwd | VNC 密码（可选） |
| route | 访问路径（以 / 开头） |

## 环境变量

- `BIND_ADDR` - 服务器监听地址（默认：0.0.0.0）
- `BIND_PORT` - 服务器监听端口（默认：8080）
- `PORT` - 备用端口配置（优先级低于 BIND_PORT）
