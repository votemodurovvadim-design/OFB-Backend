# OFB Catalog Backend API

Express.js backend for OFB Catalog application.

## Deployment to Railway

1. Create account on https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select this repository
4. Add environment variables:
   - `POSTGRES_URL` - your Neon database URL
   - `ADMIN_PASSWORD` - admin panel password (default: Gomba3rd)
5. Deploy!

Railway will automatically:
- Install dependencies
- Run `npm start`
- Provide you with a URL like `https://ofb-backend-production.up.railway.app`

## Environment Variables

```
PORT=3000
POSTGRES_URL=postgresql://...
ADMIN_PASSWORD=Gomba3rd
```

## API Endpoints

### Public
- `GET /api/companies/list?category=X&language=ru` - List companies
- `GET /api/companies/detail?id=X` - Company details
- `POST /api/applications/submit` - Submit application
- `POST /api/views/track` - Track view

### Admin (requires Bearer token)
- `POST /api/admin/login` - Login
- `GET /api/applications/list?status=pending` - List applications
- `POST /api/applications/approve` - Approve/reject application
- `PUT /api/applications/update` - Update application
- `GET /api/admin/themes` - Get theme
- `PUT /api/admin/themes` - Update theme

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```
