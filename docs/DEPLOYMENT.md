# Deployment Guide — SAMS Attendance

## Local Development

### Prerequisites
```bash
# Node 20+
node --version  # v20.x.x

# PostgreSQL 15+ (via Docker)
docker run --name sams-postgres \
  -e POSTGRES_DB=sams \
  -e POSTGRES_USER=sams \
  -e POSTGRES_PASSWORD=sams123 \
  -p 5432:5432 \
  -d postgres:15-alpine

# Redis 7+ (optional, for check-in codes)
docker run --name sams-redis -p 6379:6379 -d redis:7-alpine
```

### Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT secrets

npm install
npx prisma migrate dev --name init
npm run seed
npm run dev  # http://localhost:3000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

### Full Stack (Docker Compose)
```bash
# From repo root
docker-compose up -d
# Backend: http://localhost:3000
# Frontend: http://localhost:5173
# PostgreSQL: localhost:5432
# Redis: localhost:6379
```

---

## Environment Variables

### Backend (`.env`)
```bash
# Database
DATABASE_URL="postgresql://sams:sams123@localhost:5432/sams?schema=public"

# JWT (generate with: openssl rand -base64 32)
JWT_SECRET="your-super-secret-access-token-key-min-32-chars"
JWT_REFRESH_SECRET="your-super-secret-refresh-token-key-min-32-chars"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"

# Redis (optional - falls back to in-memory)
REDIS_URL="redis://localhost:6379"

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Frontend (`.env`)
```bash
VITE_API_URL=http://localhost:3000/api
VITE_APP_NAME=SAMS Attendance
```

---

## Production Deployment

### Option 1: MUST ICT Server (Preferred)

**Requirements from MUST ICT:**
- Ubuntu 22.04+ server with root/sudo access
- PostgreSQL 15+ installed
- Node 20+ installed
- Nginx for reverse proxy
- SSL certificate (Let's Encrypt or institutional)
- Domain/subdomain (e.g., `sams.must.ac.ug`)

**Deploy Steps:**
```bash
# 1. Clone repo on server
git clone https://github.com/mugmarp/sams-attendance
cd sams-attendance

# 2. Configure backend
cd backend
cp .env.example .env
# Edit .env with production values:
# DATABASE_URL=postgresql://sams:secure_password@localhost:5432/sams
# JWT_SECRET=... (strong, unique)
# JWT_REFRESH_SECRET=... (different from JWT_SECRET)
# NODE_ENV=production
# FRONTEND_URL=https://sams.must.ac.ug

# 3. Configure frontend
cd ../frontend
# Create .env.production
echo "VITE_API_URL=https://sams.must.ac.ug/api" > .env.production

# 4. Build
cd ../backend && npm run build
cd ../frontend && npm run build

# 5. Set up systemd service for backend
sudo tee /etc/systemd/system/sams-backend.service <<EOF
[Unit]
Description=SAMS Attendance Backend
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/sams-attendance/backend
ExecStart=/usr/bin/node dist/server.js
Environment=NODE_ENV=production
EnvironmentFile=/opt/sams-attendance/backend/.env
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 6. Configure Nginx
sudo tee /etc/nginx/sites-available/sams <<EOF
server {
    listen 80;
    server_name sams.must.ac.ug;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sams.must.ac.ug;

    ssl_certificate /etc/letsencrypt/live/sams.must.ac.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sams.must.ac.ug/privkey.pem;

    # Frontend
    location / {
        root /opt/sams-attendance/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/sams /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. Get SSL certificate
sudo certbot --nginx -d sams.must.ac.ug

# 8. Start services
sudo systemctl daemon-reload
sudo systemctl enable sams-backend
sudo systemctl start sams-backend
```

### Option 2: Render.com (Free Tier for Demo)

**Backend (Web Service):**
- Connect GitHub repo
- Root directory: `backend`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Environment variables: Add all from `.env`
- Add PostgreSQL database (Render managed)

**Frontend (Static Site):**
- Connect GitHub repo
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_URL=https://your-backend.onrender.com/api`

---

## Database Migrations (Production)

```bash
# On server, after code updates
cd /opt/sams-attendance/backend
npx prisma migrate deploy
# If schema changed, restart backend
sudo systemctl restart sams-backend
```

---

## Backup Strategy

### Database Backup (Daily Cron)
```bash
# /etc/cron.daily/sams-backup
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U sams -h localhost sams | gzip > /backups/sams_${DATE}.sql.gz
# Keep last 30 days
find /backups -name "sams_*.sql.gz" -mtime +30 -delete
```

### Restore
```bash
gunzip -c /backups/sams_20261115_020000.sql.gz | psql -U sams -h localhost sams
```

---

## Monitoring & Logs

### Backend Logs
```bash
# Systemd
sudo journalctl -u sams-backend -f

# Or if using PM2
pm2 logs sams-backend
```

### Nginx Logs
```bash
sudo tail -f /var/log/nginx/sams_access.log
sudo tail -f /var/log/nginx/sams_error.log
```

### Health Check Endpoint
```bash
curl https://sams.must.ac.ug/api/health
# Expected: {"status":"ok","timestamp":"...","uptime":...,"version":"1.0.0"}
```

---

## Security Checklist (Pre-Launch)

- [ ] Strong JWT secrets (32+ chars, unique for access/refresh)
- [ ] HTTPS enforced (HSTS header)
- [ ] CORS restricted to frontend domain only
- [ ] Rate limiting on auth endpoints (10 req/min)
- [ ] Rate limiting on check-in endpoint (30 req/min per user)
- [ ] Helmet.js security headers enabled
- [ ] Database user has minimal permissions
- [ ] `.env` not committed (in `.gitignore`)
- [ ] Admin accounts use strong passwords
- [ ] PostgreSQL `sslmode=require` in production
- [ ] Redis password set (if used)

---

## Scaling Considerations

| Component | Current | Scale To | How |
|-----------|---------|----------|-----|
| Backend | 1 instance | 2+ | PM2 cluster / Kubernetes |
| PostgreSQL | Single | Read replicas | PgBouncer + streaming replication |
| Redis | Single | Cluster | Redis Cluster mode |
| File storage | Local | S3/MinIO | For PDF exports |

---

*Version 1.0 | 2026-11-10*