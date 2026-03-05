# Taskora Quick Deploy Commands (Fill Then Run)

Use this when you want fast deployment with minimal editing.

## 1) Fill these values first

```bash
export DOMAIN="yourdomain.com"
export WWW_DOMAIN="www.yourdomain.com"
export REPO_URL="https://github.com/yourname/your-repo.git"
export APP_DIR="/var/www/taskora"
export JWT_SECRET="replace-with-long-random-secret"
```

## 2) First-time server setup (Ubuntu VPS)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 3) Clone and install app

```bash
sudo mkdir -p "$APP_DIR"
sudo chown -R $USER:$USER "$APP_DIR"
cd "$APP_DIR"
git clone "$REPO_URL" .
npm install
```

## 4) Create production `.env`

```bash
cat > .env << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$JWT_SECRET
BASE_URL=https://$DOMAIN

AUTH_RATE_WINDOW_MS=900000
AUTH_RATE_MAX=30
RESET_RATE_WINDOW_MS=900000
RESET_RATE_MAX=10

SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_SECURE=false
MAIL_FROM=no-reply@$DOMAIN

GOOGLE_CLIENT_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
EOF
```

## 5) Run app with PM2

```bash
cd "$APP_DIR"
pm2 start server/server.js --name taskora
pm2 save
pm2 startup
curl http://127.0.0.1:3000/api/health
```

## 6) Nginx config

```bash
sudo tee /etc/nginx/sites-available/taskora > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/taskora /etc/nginx/sites-enabled/taskora
sudo nginx -t
sudo systemctl restart nginx
```

## 7) SSL

```bash
sudo certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN"
```

## 8) Update later

```bash
cd "$APP_DIR"
git pull
npm install
pm2 restart taskora
pm2 logs taskora --lines 100
```
