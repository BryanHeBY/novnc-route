const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 读取配置
const configPath = path.join(__dirname, 'config.json');
let config = [];

function loadConfig() {
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(data);
    console.log('Loaded config:', config);
  } catch (err) {
    console.error('Error loading config:', err);
    config = [];
  }
}

loadConfig();

// 处理 favicon.ico 请求
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end(); // No Content
});

// noVNC 目录路径（手动下载的完整版本）
const novncPath = path.join(__dirname, 'noVNC');

// 检查 noVNC 目录是否存在
if (!fs.existsSync(novncPath)) {
  console.error('noVNC directory not found. Please clone noVNC repository:');
  console.error('  git clone https://github.com/novnc/noVNC.git');
  console.error('  # 如果需要特定版本，可以切换到标签，例如：');
  console.error('  # cd noVNC && git checkout v1.6.0');
  process.exit(1);
}


// 通用处理函数，支持vnc.html和vnc_lite.html
const handleVncPage = (pageName) => (req, res, next) => {
  // 如果已经有path参数，说明是重定向后的连接，直接返回静态文件
  if (req.query.path) {
    return next();
  }

  const routeParam = req.query.route;
  if (!routeParam) {
    res.status(400).send(`Missing route parameter. Usage: /${pageName}?route=xfce`);
    return;
  }

  // 查找对应的 VNC 配置
  const vncConfig = config.find(c =>
    c.route === routeParam ||
    c.route === `/${routeParam}`
  );

  if (!vncConfig) {
    res.status(404).send(`Route '${routeParam}' not found. Available routes: ${config.map(c => c.route.replace(/^\//, '')).join(', ')}`);
    return;
  }

  const passwd = vncConfig.passwd || '';

  // 直接构造带所有参数的noVNC URL，让noVNC原生处理自动连接
  const params = new URLSearchParams();
  params.set('host', req.hostname);
  params.set('port', req.socket.localPort || (req.protocol === 'https' ? 443 : 80));
  params.set('path', `/websockify/${encodeURIComponent(routeParam)}`);
  params.set('autoconnect', '1');
  params.set('scale', 'true');
  params.set('resize', 'remote');
  if (passwd) {
    params.set('password', passwd);
  }

  // 重定向到原生页面，所有参数都通过URL传递，无需任何注入
  res.redirect(`/${pageName}?${params.toString()}`);
};

// 注册两个页面的路由
app.get('/vnc.html', handleVncPage('vnc.html'));
app.get('/vnc_lite.html', handleVncPage('vnc_lite.html'));

// 根路径重定向到 vnc.html 或者显示路由列表
app.get('/', (_req, res) => {
  const routeList = config.map(c => {
    const routeName = c.route.replace(/^\//, '');
    return `
      <li>
        <strong>${routeName}</strong> -> ${c.ip}:${c.port}
        <br>
        <a href="/vnc.html?route=${routeName}">完整版</a> |
        <a href="/vnc_lite.html?route=${routeName}">轻量版</a>
      </li>`;
  }).join('');

  res.send(`
    <html>
      <head>
        <title>noVNC Proxy</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
          li { margin: 1rem 0; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
        </style>
      </head>
      <body>
        <h1>Available VNC Desktops</h1>
        <ul>${routeList}</ul>
        <p>Direct access examples:</p>
        <ul>
          <li><code>/vnc.html?route=xfce</code> - 完整版</li>
          <li><code>/vnc_lite.html?route=xfce</code> - 轻量版</li>
        </ul>
      </body>
    </html>
  `);
});

// 最后提供 noVNC 静态文件，这样自定义路由不会被覆盖
app.use(express.static(novncPath));

// WebSocket 代理
wss.on('connection', (ws, req) => {
  const url = req.url;
  // 规范化URL，合并所有连续的斜杠为单个斜杠（处理反向代理导致的多斜杠问题）
  const normalizedUrl = url.replace(/\/+/g, '/');
  console.log('WebSocket connection:', url, '(normalized:', normalizedUrl + ')');
  console.log('Referer:', req.headers.referer);
  console.log('Origin:', req.headers.origin);
  console.log('Host:', req.headers.host);
  console.log('All headers:', JSON.stringify(req.headers, null, 2));

  let vncConfig = null;

  // 首先尝试从路径中获取 route：/websockify/xfce
  const pathParts = normalizedUrl.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'websockify') {
    const routeParam = pathParts[2];
    console.log('Extracted route parameter from path:', routeParam);
    if (routeParam) {
      vncConfig = config.find(c =>
        c.route === routeParam ||
        c.route === `/${routeParam}` ||
        c.route === decodeURIComponent(routeParam)
      );
      if (vncConfig) {
        console.log(`Found route ${vncConfig.route} from path parameter`);
      }
    }
  }

  // 然后尝试从查询参数中获取 route
  if (!vncConfig) {
    try {
      const urlObj = new URL(normalizedUrl, `http://${req.headers.host || 'localhost'}`);
      const routeParam = urlObj.searchParams.get('route');
      console.log('Extracted route parameter from query:', routeParam);
      if (routeParam) {
        vncConfig = config.find(c =>
          c.route === routeParam ||
          c.route === `/${routeParam}` ||
          c.route === decodeURIComponent(routeParam)
        );
        if (vncConfig) {
          console.log(`Found route ${vncConfig.route} from query parameter`);
        }
      }
    } catch (e) {
      console.log('Error parsing URL for query params:', e.message);
    }
  }


  // 然后从 Referer 头提取（从 vnc.html?route=xxx 中获取路由）
  if (!vncConfig && req.headers.referer) {
    console.log('Trying to extract route from Referer:', req.headers.referer);
    try {
      const refererUrl = new URL(req.headers.referer);
      const routeParam = refererUrl.searchParams.get('route');
      if (routeParam) {
        vncConfig = config.find(c =>
          c.route === routeParam ||
          c.route === `/${routeParam}`
        );
        if (vncConfig) {
          console.log(`Found route ${vncConfig.route} from Referer query parameter`);
        }
      }
    } catch (e) {
      console.log('Error parsing Referer URL:', e.message);
    }
  }

  // 最后尝试从 Referer 路径中匹配（兼容旧的路径方式）
  if (!vncConfig && req.headers.referer) {
    for (const vnc of config) {
      if (req.headers.referer.includes(vnc.route)) {
        vncConfig = vnc;
        console.log(`Found route ${vnc.route} from Referer path`);
        break;
      }
    }
  }

  if (!vncConfig) {
    console.log('No VNC config found for:', normalizedUrl, '(original:', url + ')');
    console.log('Available routes:', config.map(c => c.route).join(', '));
    console.log('All headers:', JSON.stringify(req.headers, null, 2));
    ws.close();
    return;
  }

  console.log(`Proxying ${vncConfig.route} to ${vncConfig.ip}:${vncConfig.port}`);

  // 连接到 VNC 服务器
  const vncSocket = net.connect(vncConfig.port, vncConfig.ip);

  vncSocket.on('connect', () => {
    console.log(`Connected to VNC server ${vncConfig.ip}:${vncConfig.port}`);
  });

  // 浏览器 -> VNC
  ws.on('message', (data) => {
    if (vncSocket.writable) {
      vncSocket.write(data);
    }
  });

  // VNC -> 浏览器
  vncSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket closed');
    vncSocket.end();
  });

  vncSocket.on('close', () => {
    console.log('VNC socket closed');
    ws.close();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    vncSocket.end();
  });

  vncSocket.on('error', (err) => {
    console.error('VNC socket error:', err);
    ws.close();
  });
});

const PORT = process.env.BIND_PORT || process.env.PORT || 8080;
const ADDR = process.env.BIND_ADDR || '0.0.0.0';
server.listen(PORT, ADDR, () => {
  console.log(`Server running on ${ADDR}:${PORT}`);
  console.log('Available VNC desktops:');
  config.forEach(vnc => {
    const routeName = vnc.route.replace(/^\//, '');
    console.log(`  /vnc.html?route=${routeName} -> ${vnc.ip}:${vnc.port}`);
    console.log(`    URL: http://${ADDR === '0.0.0.0' ? 'localhost' : ADDR}:${PORT}/vnc.html?route=${routeName}`);
    if (vnc.passwd) {
      console.log(`    Password: ${'*'.repeat(Math.min(8, vnc.passwd.length))}`);
    }
  });
  console.log(`\nRoot page: http://${ADDR === '0.0.0.0' ? 'localhost' : ADDR}:${PORT}/`);
  console.log('\nNote: WebSocket connections use /websockify?route=xxx path\n');
});