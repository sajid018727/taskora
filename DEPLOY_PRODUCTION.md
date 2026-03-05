# Taskora Production Deploy (Ubuntu VPS + Nginx + PM2 + SSL)

## 1) Server prerequisites
Run on fresh Ubuntu 22.04/24.04 VPS:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
node -v
npm -v
```

## 2) App setup

```bash
cd /var/www
sudo mkdir -p taskora
sudo chown -R $USER:$USER taskora
cd taskora
git clone <YOUR_REPO_URL> .
npm install
```

## 3) Production environment
Create `.env` in project root:

```bash
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
BASE_URL=https://yourdomain.com

AUTH_RATE_WINDOW_MS=900000
AUTH_RATE_MAX=30
RESET_RATE_WINDOW_MS=900000
RESET_RATE_MAX=10

SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_SECURE=false
MAIL_FROM=no-reply@yourdomain.com

# Optional social auth
GOOGLE_CLIENT_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
EOF
```

## 4) Start with PM2

```bash
cd /var/www/taskora
pm2 start server/server.js --name taskora
pm2 save
pm2 startup
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

## 5) Nginx reverse proxy
Create Nginx config:

```bash
sudo tee /etc/nginx/sites-available/taskora > /dev/null << 'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

Enable and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/taskora /etc/nginx/sites-enabled/taskora
sudo nginx -t
sudo systemctl restart nginx
```

## 6) SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo systemctl status certbot.timer
```

## 7) Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 8) Update/redeploy flow

```bash
cd /var/www/taskora
git pull
npm install
pm2 restart taskora
pm2 logs taskora --lines 100
```

## 9) Backup (SQLite)
Quick daily backup cron example:

```bash
mkdir -p /var/backups/taskora
crontab -e
```

Add line:

```bash
0 3 * * * cp /var/www/taskora/server/data/taskora.sqlite /var/backups/taskora/taskora-$(date +\%F).sqlite
```

## 10) DNS checklist
- `A` record: `yourdomain.com -> VPS_IP`
- `A` record: `www.yourdomain.com -> VPS_IP`
- Wait DNS propagation, then run SSL command.

## Quick troubleshooting
- App down: `pm2 status`, `pm2 logs taskora`
- Nginx issue: `sudo nginx -t`, `sudo journalctl -u nginx -n 200`
- Port conflict: `sudo lsof -i :3000`
- Wrong callbacks: check `BASE_URL` and OAuth provider redirect URLs.
