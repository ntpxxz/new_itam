import './env.js';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, UPLOAD_DIR } from './db.js';
import { bootstrap, purgeOldLogs } from './bootstrap.js';
import { sessionMiddleware, requireAuth, purgeExpiredSessions } from './auth.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/master.js';
import assetRoutes from './routes/assets.js';
import consumableRoutes from './routes/consumables.js';
import dashboardRoutes from './routes/dashboard.js';
import transactionRoutes from './routes/transactions.js';
import adminRoutes from './routes/admin.js';
import stockCountRoutes from './routes/stockcount.js';
import itemRoutes from './routes/items.js';
import documentRoutes from './routes/documents.js';
import reportRoutes from './routes/reports.js';

const PORT = Number(process.env.PORT || 3093);
const PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';

bootstrap();
purgeOldLogs();
setInterval(() => { purgeOldLogs(); purgeExpiredSessions(); }, 6 * 60 * 60 * 1000).unref();

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (PROD) {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);

// Reject cross-site state-changing requests (defense in depth on top of SameSite=Strict).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'คำขอจากแหล่งที่ไม่อนุญาต' });
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/consumables', consumableRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stock-counts', stockCountRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ API นี้' }));

app.use('/uploads', requireAuth, express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

if (PROD) {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(dist)) {
    console.error('dist/ not found — run "npm run build" first');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html'), { maxAge: 0 }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.js'), server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status >= 500) console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ใหญ่เกินไป (สูงสุด 8 MB)'
    : status >= 500 ? 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ' : err.message;
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return res.status(status).json({ error: message });
  res.status(status).send(message);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  AssetFlow ITAM  ${PROD ? '(production)' : '(dev)'}  →  http://localhost:${PORT}\n`);
});
