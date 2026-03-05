# 使用 Node.js 官方镜像作为基础镜像
FROM node:18-alpine

# 安装 git（用于初始化子模块）
RUN apk add --no-cache git

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 检查 noVNC 目录是否存在，如果不存在则从 GitHub 克隆
RUN if [ ! -d "noVNC" ] || [ -z "$(ls -A noVNC)" ]; then \
      echo "noVNC directory not found or empty, cloning from GitHub..." && \
      git clone --depth 1 https://github.com/novnc/noVNC.git noVNC; \
    else \
      echo "noVNC directory already exists, skipping clone"; \
    fi

# 暴露端口
EXPOSE 8080

# 设置环境变量
ENV NODE_ENV=production

# 启动命令
CMD ["node", "server.js"]