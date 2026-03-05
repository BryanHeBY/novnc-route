# Docker 部署指南

本文档介绍如何使用 Docker 和 Docker Compose 部署 noVNC 代理服务器。

## 快速开始

### 1. 使用 Docker Compose（推荐）

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. 使用 Docker 直接运行

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

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BIND_ADDR` | `0.0.0.0` | 服务器监听地址 |
| `BIND_PORT` | `8080` | 服务器监听端口 |
| `PORT` | - | 备用端口（优先级低于 `BIND_PORT`） |
| `NODE_ENV` | `production` | Node.js 环境 |

### 端口映射

默认将容器的 8080 端口映射到主机的 8080 端口。可以通过修改 `docker-compose.yml` 中的 `ports` 配置或使用 `-p` 参数自定义：

```yaml
ports:
  - "3000:8080"  # 主机端口:容器端口
```

### 配置文件挂载

`config.json` 文件通过卷挂载到容器中，方便修改配置而无需重建镜像：

```yaml
volumes:
  - ./config.json:/app/config.json:ro
```

如果需要动态修改配置并热重载（当前需要重启容器），可以将挂载模式改为读写：

```yaml
volumes:
  - ./config.json:/app/config.json
```

## Docker Compose 配置详解

### 完整配置示例

```yaml
version: '3.8'

services:
  novnc-proxy:
    build: .
    ports:
      - "8080:8080"
    environment:
      - BIND_ADDR=0.0.0.0
      - BIND_PORT=8080
      - NODE_ENV=production
    volumes:
      - ./config.json:/app/config.json:ro
      # 如果需要持久化日志
      # - ./logs:/app/logs
    restart: unless-stopped
```


## 构建自定义镜像

### 1. 修改 Dockerfile

如果需要定制构建过程，可以编辑 `Dockerfile`：

```dockerfile
# 使用不同的 Node.js 版本
FROM node:20-alpine

# 安装额外依赖
RUN apk add --no-cache curl

# 设置时区
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai
```

### 2. 构建并推送镜像

```bash
# 构建
docker build -t yourusername/novnc-proxy:latest .

# 推送
docker push yourusername/novnc-proxy:latest
```

## 生产环境部署建议

### 1. 使用 .env 文件管理环境变量

创建 `.env` 文件：

```env
HOST_PORT=8080
BIND_ADDR=0.0.0.0
NODE_ENV=production
```

在 `docker-compose.yml` 中引用：

```yaml
ports:
  - "${HOST_PORT}:8080"
```

### 2. 使用 Docker Swarm 或 Kubernetes

#### Docker Swarm

```bash
# 部署栈
docker stack deploy -c docker-compose.yml novnc

# 查看服务
docker service ls
```

#### Kubernetes

创建 `deployment.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: novnc-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: novnc-proxy
  template:
    metadata:
      labels:
        app: novnc-proxy
    spec:
      containers:
      - name: novnc-proxy
        image: novnc-proxy:latest
        ports:
        - containerPort: 8080
        env:
        - name: BIND_ADDR
          value: "0.0.0.0"
        - name: BIND_PORT
          value: "8080"
        volumeMounts:
        - name: config
          mountPath: /app/config.json
          subPath: config.json
      volumes:
      - name: config
        configMap:
          name: novnc-config
```

### 3. 日志管理

```bash
# 查看实时日志
docker-compose logs -f --tail=100

# 导出日志
docker-compose logs > logs.txt

# 使用日志驱动
# 在 docker-compose.yml 中添加：
# logging:
#   driver: "json-file"
#   options:
#     max-size: "10m"
#     max-file: "3"
```

## 故障排除

### 1. 容器启动失败

```bash
# 查看详细错误信息
docker-compose logs novnc-proxy

# 进入容器调试
docker-compose run --rm novnc-proxy sh
```

### 2. noVNC 目录问题

如果出现 noVNC 目录不存在的错误，确保：

1. 子模块已初始化：`git submodule update --init --recursive`
2. 或者 Dockerfile 会自动克隆 noVNC 仓库

### 3. 端口冲突

如果端口已被占用，修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "8081:8080"  # 使用不同的主机端口
```

### 4. 配置文件权限

确保 `config.json` 文件有正确的权限：

```bash
chmod 644 config.json
```

## 更新与维护

### 1. 更新代码

```bash
# 拉取最新代码
git pull origin main

# 更新子模块
git submodule update --init --recursive

# 重建并重启
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 2. 清理 Docker 资源

```bash
# 删除未使用的镜像
docker image prune -a

# 删除未使用的容器
docker container prune

# 删除未使用的卷
docker volume prune
```

## 安全建议

1. **不要将敏感信息硬编码在镜像中**：使用环境变量或配置卷
2. **使用只读卷挂载**：配置文件使用 `:ro` 只读模式
3. **限制网络访问**：在防火墙中限制访问端口
4. **定期更新基础镜像**：更新 Node.js 基础镜像以获取安全补丁
5. **使用非 root 用户运行**（高级）：在 Dockerfile 中添加用户切换

---

通过 Docker 部署，您可以轻松地在任何支持 Docker 的环境中运行 noVNC 代理服务器，并享受容器化带来的便利性和一致性。