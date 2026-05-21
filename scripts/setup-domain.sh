#!/usr/bin/env bash
# OZIMIZNI TAXI — Domain setup (ozimizi-taxi.yuksalish.dev)
# Run on server. Idempotent.
set -eo pipefail

DOMAIN="${DOMAIN:-ozimizi-taxi.yuksalish.dev}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ozimizi-taxi}"
BACKEND_PORT=6001
DRIVER_PORT=6002
ADMIN_PORT=6003

echo "→ Backend .env yangilaymiz (CORS, DRIVER_APP_URL)"
ENV_FILE="$DEPLOY_DIR/backend/.env"
sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" "$ENV_FILE"
sed -i "s|^DRIVER_APP_URL=.*|DRIVER_APP_URL=https://$DOMAIN|" "$ENV_FILE"

echo "→ Driver PWA .env.local yangilaymiz"
cat > "$DEPLOY_DIR/driver-pwa/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_WS_URL=https://$DOMAIN
EOF

echo "→ Admin Panel .env.local yangilaymiz (basePath=/admin)"
cat > "$DEPLOY_DIR/admin-panel/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_WS_URL=https://$DOMAIN
NEXT_PUBLIC_BASE_PATH=/admin
EOF

echo "→ Driver PWA rebuild"
cd "$DEPLOY_DIR/driver-pwa"
npm run build

echo "→ Admin Panel rebuild"
cd "$DEPLOY_DIR/admin-panel"
npm run build

echo "→ Nginx site config"
NGX_FILE="/etc/nginx/sites-available/$DOMAIN"
cat > "$NGX_FILE" <<EOF
# OZIMIZNI TAXI
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 20M;

    # ── WebSocket (Socket.IO) ──
    location /socket.io/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    # ── Backend API (strip /api prefix) ──
    location /api/ {
        rewrite ^/api/(.*)\$ /\$1 break;
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 20M;
    }

    # ── Uploaded files (driver avatar, car photos) ──
    location /uploads/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # ── Admin Panel (subpath /admin) ──
    location /admin {
        proxy_pass http://127.0.0.1:$ADMIN_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # ── Driver PWA (root) ──
    location / {
        proxy_pass http://127.0.0.1:$DRIVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf "$NGX_FILE" "/etc/nginx/sites-enabled/$DOMAIN"

echo "→ Nginx test + reload"
nginx -t
systemctl reload nginx

echo "→ Certbot — Let's Encrypt SSL"
if command -v certbot >/dev/null; then
    certbot --nginx -n --agree-tos -m bekmuhammad.devoloper@gmail.com -d "$DOMAIN" --redirect || \
        echo "  ! certbot failed (DNS hali tarqalmagan bo'lishi mumkin). Keyinroq qayta urinib ko'ring: certbot --nginx -d $DOMAIN"
else
    echo "  ! certbot o'rnatilmagan. SSL uchun: apt install certbot python3-certbot-nginx"
fi

echo "→ PM2 restart"
pm2 restart ozimizi-backend ozimizi-driver ozimizi-admin --update-env
pm2 save

echo ""
echo "════════════════════════════════════════════"
echo "✅ Domain setup tugadi"
echo ""
echo "  Driver PWA: https://$DOMAIN/"
echo "  Admin Panel: https://$DOMAIN/admin"
echo "  API:         https://$DOMAIN/api/..."
echo "════════════════════════════════════════════"
