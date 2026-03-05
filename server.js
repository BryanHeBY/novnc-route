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

// 读取 vnc.html 模板
let vncHtmlTemplate = '';
try {
  vncHtmlTemplate = fs.readFileSync(path.join(novncPath, 'vnc.html'), 'utf8');
} catch (err) {
  console.error('Error reading vnc.html:', err);
  vncHtmlTemplate = '';
}

// 为每个路由创建端点
config.forEach(vnc => {
  const route = vnc.route;
  const passwd = vnc.passwd || '';

  // 为每个路由提供 noVNC 静态文件（完整版本）
  // 例如：/gnome/novnc/ -> noVNC/
  app.use(`${route}/novnc`, express.static(novncPath));

  // 主页面 - 使用完整的 vnc.html 并注入自动连接配置
  app.get(route, (_req, res) => {
    if (!vncHtmlTemplate) {
      res.status(500).send('vnc.html template not loaded');
      return;
    }

    // 修改 vnc.html 中的资源路径，添加路由前缀
    let html = vncHtmlTemplate
      .replace(/href="app\//g, `href="${route}/novnc/app/`)
      .replace(/src="app\//g, `src="${route}/novnc/app/`)
      .replace(/'app\//g, `'${route}/novnc/app/`)
      .replace(/"app\//g, `"${route}/novnc/app/`)
      .replace(/\.\/app\//g, `${route}/novnc/app/`)
      .replace(/'\.\/core\//g, `'${route}/novnc/core/`)
      .replace(/"\.\/core\//g, `"${route}/novnc/core/`)
      .replace(/\.\/core\//g, `${route}/novnc/core/`)
      .replace(/\.\/defaults\.json/g, `${route}/novnc/defaults.json`)
      .replace(/\.\/mandatory\.json/g, `${route}/novnc/mandatory.json`)
      .replace(/\.\/package\.json/g, `${route}/novnc/package.json`)
      // 处理音频文件路径
      .replace(/src="app\/sounds\//g, `src="${route}/novnc/app/sounds/`)
      .replace(/"app\/sounds\//g, `"${route}/novnc/app/sounds/`)
      // 处理预加载图片路径
      .replace(/href="app\/images\//g, `href="${route}/novnc/app/images/`);

    // 在 head 中注入配置脚本，在模块加载之前
    const headScript = `
<script>
  // 在模块加载之前设置全局配置
  (function() {
    const autoPassword = ${JSON.stringify(passwd)};
    const wsPath = '${route}/ws'; // 绝对路径

    // 创建全局配置对象
    window.autoVNCConfig = {
      host: window.location.hostname,
      port: window.location.port || (window.location.protocol === 'https:' ? '443' : '80'),
      path: wsPath,
      scale: true,
      autoconnect: true,
      password: autoPassword || ''
    };

    console.log('noVNC auto-connect configured for route:', '${route}', 'wsPath:', wsPath, 'host:', window.autoVNCConfig.host);

    // 立即设置查询参数，这样 noVNC 可以直接读取
    if (!window.location.search) {
      // 在 URL 中添加查询参数（不刷新页面）
      const params = new URLSearchParams();
      params.set('host', window.autoVNCConfig.host);
      params.set('port', window.autoVNCConfig.port);
      params.set('path', window.autoVNCConfig.path);
      params.set('scale', window.autoVNCConfig.scale ? '1' : '0');
      params.set('autoconnect', window.autoVNCConfig.autoconnect ? '1' : '0');
      if (window.autoVNCConfig.password) {
        params.set('password', window.autoVNCConfig.password);
      }

      // 更新 URL 但不刷新页面
      const newUrl = window.location.pathname + '?' + params.toString() + window.location.hash;
      window.history.replaceState({}, '', newUrl);
      console.log('Updated URL with connection parameters:', newUrl);
    }

    // 重写 WebUtil.getQueryVar 和 getConfigVar
    Object.defineProperty(window, 'WebUtil', {
      configurable: true,
      set: function(value) {
        delete window.WebUtil;
        window.WebUtil = value;

        const originalGetQueryVar = window.WebUtil.getQueryVar;
        const originalGetConfigVar = window.WebUtil.getConfigVar;

        window.WebUtil.getQueryVar = function(name, defVal) {
          console.log('WebUtil.getQueryVar called for:', name, 'defVal:', defVal);
          if (name === 'host') return window.autoVNCConfig.host;
          if (name === 'port') return window.autoVNCConfig.port;
          if (name === 'path') return window.autoVNCConfig.path;
          if (name === 'scale') return 'true';
          if (name === 'autoconnect') return '1';
          if (name === 'password' && window.autoVNCConfig.password) return window.autoVNCConfig.password;
          if (originalGetQueryVar) {
            const result = originalGetQueryVar.call(this, name, defVal);
            console.log('Original getQueryVar returned:', result, 'for:', name);
            return result;
          }
          console.log('Returning default:', defVal, 'for:', name);
          return defVal;
        };

        window.WebUtil.getConfigVar = window.WebUtil.getQueryVar;
        console.log('WebUtil.getQueryVar/getConfigVar overridden');
      }
    });

    // 重写 UI.start
    Object.defineProperty(window, 'UI', {
      configurable: true,
      set: function(value) {
        delete window.UI;
        window.UI = value;

        if (window.UI.start) {
          const originalStart = window.UI.start;
          window.UI.start = function(config) {
            console.log('UI.start called with config:', config);
            if (!config) config = {};
            if (!config.settings) config.settings = {};
            if (!config.settings.defaults) config.settings.defaults = {};

            // 合并配置
            Object.assign(config.settings.defaults, window.autoVNCConfig);
            console.log('Final config defaults:', config.settings.defaults);

            return originalStart.call(this, config);
          };
          console.log('UI.start overridden');
        }
      }
    });
  })();
</script>`;

    // 在 head 开始后立即插入脚本，确保在模块加载之前执行
    html = html.replace('<head>', '<head>' + headScript);

    res.send(html);
  });
});

// WebSocket 代理
wss.on('connection', (ws, req) => {
  const url = req.url;
  // 规范化URL，移除开头的双斜杠
  const normalizedUrl = url.replace(/^\/\//, '/');
  console.log('WebSocket connection:', url, '(normalized:', normalizedUrl + ')');
  console.log('Referer:', req.headers.referer);
  console.log('Origin:', req.headers.origin);
  console.log('Host:', req.headers.host);
  console.log('All headers:', JSON.stringify(req.headers, null, 2));

  let vncConfig = null;

  // 情况1：直接使用路由路径，如 /gnome/ws 或 //gnome/ws
  vncConfig = config.find(c => normalizedUrl.startsWith(`${c.route}/ws`));
  if (vncConfig) {
    console.log(`Found route ${vncConfig.route} from direct path match`);
  }

  // 情况2：使用默认的 /websockify 路径
  if (!vncConfig && (normalizedUrl === '/websockify' || normalizedUrl.startsWith('/websockify?'))) {
    console.log('Detected default /websockify path, trying to find route');

    // 从查询参数中找路由
    if (!vncConfig) {
      try {
        const urlObj = new URL(normalizedUrl, `http://${req.headers.host}`);
        const routeParam = urlObj.searchParams.get('route');
        if (routeParam) {
          vncConfig = config.find(c => c.route === routeParam || c.route === `/${routeParam}`);
          if (vncConfig) {
            console.log(`Found route ${vncConfig.route} from query parameter for /websockify`);
          }
        }
      } catch (e) {
        console.log('Error parsing URL:', e.message);
      }
    }

    // 从 Referer 头提取路由
    if (!vncConfig && req.headers.referer) {
      console.log('Trying to extract route from Referer:', req.headers.referer);
      for (const vnc of config) {
        // 检查 Referer 是否包含路由路径
        if (req.headers.referer.includes(vnc.route)) {
          vncConfig = vnc;
          console.log(`Found route ${vnc.route} from Referer for /websockify`);
          break;
        }
      }
    }

    // 从 Origin 头找
    if (!vncConfig && req.headers.origin) {
      try {
        const originUrl = new URL(req.headers.origin);
        const originPath = originUrl.pathname;
        console.log('Trying to extract route from Origin path:', originPath);
        for (const vnc of config) {
          if (originPath.includes(vnc.route)) {
            vncConfig = vnc;
            console.log(`Found route ${vnc.route} from Origin header for /websockify`);
            break;
          }
        }
      } catch (e) {
        console.log('Error parsing Origin:', e.message);
      }
    }

    // 尝试从 Host 和路径推断
    if (!vncConfig && req.headers.host) {
      console.log('Trying to infer route from Host and request context');
      // 这里可以添加更多逻辑，但可能需要更复杂的会话管理
    }
  }

  // 情况3：通过 Referer 头找（通用情况）
  if (!vncConfig && req.headers.referer) {
    for (const vnc of config) {
      if (req.headers.referer.includes(vnc.route)) {
        vncConfig = vnc;
        console.log(`Found route ${vnc.route} from Referer header`);
        break;
      }
    }
  }

  // 情况4：尝试从 WebSocket URL 的查询参数中提取（通用情况）
  if (!vncConfig && normalizedUrl.includes('?')) {
    try {
      const urlObj = new URL(normalizedUrl, `http://${req.headers.host}`);
      const routeParam = urlObj.searchParams.get('route');
      if (routeParam) {
        vncConfig = config.find(c => c.route === routeParam || c.route === `/${routeParam}`);
        if (vncConfig) {
          console.log(`Found route ${vncConfig.route} from URL query parameter`);
        }
      }
    } catch (e) {
      console.log('Error parsing URL for query params:', e.message);
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
  console.log('Available routes:');
  config.forEach(vnc => {
    console.log(`  http://${ADDR === '0.0.0.0' ? 'localhost' : ADDR}:${PORT}${vnc.route} -> ${vnc.ip}:${vnc.port}`);
    if (vnc.passwd) {
      console.log(`    Password: ${vnc.passwd ? '******' : 'none'}`);
    }
  });
  console.log('\nNote: WebSocket connections can use either:');
  console.log('  - Direct route path: /gnome/ws');
  console.log('  - Default path: /websockify (will be auto-routed based on Referer)\n');
});