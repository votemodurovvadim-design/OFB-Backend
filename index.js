import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sql } from '@vercel/postgres';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Проверка токена админа
function verifyToken(token) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    return decoded.startsWith('admin:');
  } catch {
    return false;
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'OFB Backend API is running' });
});

// ==================== ADMIN ROUTES ====================

// POST /api/admin/login - Авторизация
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const correctPassword = process.env.ADMIN_PASSWORD || 'Gomba3rd';

    if (password !== correctPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = Buffer.from(`admin:${Date.now()}:${password}`).toString('base64');

    res.json({ 
      success: true, 
      token,
      message: 'Login successful' 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET/PUT /api/admin/themes - Управление темами
app.get('/api/admin/themes', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await sql`
      SELECT value FROM settings WHERE key = 'active_theme'
    `;

    const theme = result.rows.length > 0 ? result.rows[0].value : 'new_year';
    res.json({ theme });
  } catch (error) {
    console.error('Get theme error:', error);
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

app.put('/api/admin/themes', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { theme } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'Theme is required' });
    }

    await sql`
      INSERT INTO settings (key, value)
      VALUES ('active_theme', ${theme})
      ON CONFLICT (key) 
      DO UPDATE SET value = ${theme}, updated_at = NOW()
    `;

    res.json({ success: true, message: 'Theme updated' });
  } catch (error) {
    console.error('Update theme error:', error);
    res.status(500).json({ error: 'Failed to update theme' });
  }
});

// ==================== APPLICATIONS ROUTES ====================

// GET /api/applications/list - Список заявок
app.get('/api/applications/list', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { status = 'pending' } = req.query;

    const result = await sql`
      SELECT 
        id, category, name, description, description_en,
        logo_url, manager_username, contact_link, status,
        publish_start, publish_end, created_at, updated_at
      FROM applications
      WHERE status = ${status}
      ORDER BY created_at DESC
    `;

    res.json(result.rows);
  } catch (error) {
    console.error('List applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// POST /api/applications/submit - Подача заявки
app.post('/api/applications/submit', async (req, res) => {
  try {
    const { category, name, description, managerUsername, contactLink, logoData } = req.body;

    if (!category || !name || !description || !managerUsername) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await sql`
      INSERT INTO applications (
        category, name, description, logo_url,
        manager_username, contact_link, status
      )
      VALUES (
        ${category}, ${name}, ${description}, ${logoData || null},
        ${managerUsername}, 
        ${contactLink || `https://t.me/${managerUsername.replace('@', '')}`},
        'pending'
      )
      RETURNING id
    `;

    res.json({ 
      success: true, 
      message: 'Application submitted successfully',
      applicationId: result.rows[0].id 
    });
  } catch (error) {
    console.error('Submit application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// POST /api/applications/approve - Одобрение/отклонение
app.post('/api/applications/approve', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { id, approved, publishStart, publishEnd } = req.body;

    if (!id || approved === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newStatus = approved ? 'published' : 'rejected';

    await sql`
      UPDATE applications
      SET 
        status = ${newStatus},
        publish_start = ${publishStart || null},
        publish_end = ${publishEnd || null},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    res.json({ 
      success: true, 
      message: `Application ${approved ? 'approved' : 'rejected'}` 
    });
  } catch (error) {
    console.error('Approve application error:', error);
    res.status(500).json({ error: 'Failed to process application' });
  }
});

// PUT /api/applications/update - Обновление заявки
app.put('/api/applications/update', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { 
      id, category, name, description, descriptionEn,
      logoUrl, managerUsername, contactLink,
      publishStart, publishEnd, status
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    await sql`
      UPDATE applications
      SET 
        category = COALESCE(${category}, category),
        name = COALESCE(${name}, name),
        description = COALESCE(${description}, description),
        description_en = COALESCE(${descriptionEn}, description_en),
        logo_url = COALESCE(${logoUrl}, logo_url),
        manager_username = COALESCE(${managerUsername}, manager_username),
        contact_link = COALESCE(${contactLink}, contact_link),
        publish_start = COALESCE(${publishStart}::date, publish_start),
        publish_end = COALESCE(${publishEnd}::date, publish_end),
        status = COALESCE(${status}, status),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    res.json({ success: true, message: 'Application updated' });
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// ==================== COMPANIES ROUTES ====================

// GET /api/companies/list - Список компаний по категории
app.get('/api/companies/list', async (req, res) => {
  try {
    const { category, language = 'ru' } = req.query;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const result = await sql`
      SELECT 
        id, category, name, description, description_en,
        logo_url, manager_username, contact_link
      FROM applications
      WHERE 
        category = ${category}
        AND status = 'published'
        AND (publish_start IS NULL OR publish_start <= CURRENT_DATE)
        AND (publish_end IS NULL OR publish_end >= CURRENT_DATE)
      ORDER BY created_at DESC
    `;

    const companies = result.rows.map(row => ({
      id: row.id,
      category: row.category,
      name: row.name,
      description: language === 'en' && row.description_en ? row.description_en : row.description,
      logo_url: row.logo_url || '/images/placeholder.png',
      manager_username: row.manager_username,
      contact_link: row.contact_link
    }));

    res.json(companies);
  } catch (error) {
    console.error('List companies error:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/detail - Детали компании
app.get('/api/companies/detail', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    const result = await sql`
      SELECT 
        id, category, name, description, description_en,
        logo_url, manager_username, contact_link
      FROM applications
      WHERE 
        id = ${id}
        AND status = 'published'
        AND (publish_start IS NULL OR publish_start <= CURRENT_DATE)
        AND (publish_end IS NULL OR publish_end >= CURRENT_DATE)
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get company detail error:', error);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

// ==================== VIEWS ROUTES ====================

// POST /api/views/track - Трекинг просмотров
app.post('/api/views/track', async (req, res) => {
  try {
    const { applicationId, viewerId, viewerUsername } = req.body;

    if (!applicationId || !viewerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await sql`
      INSERT INTO views (application_id, viewer_id, viewer_username)
      VALUES (${applicationId}, ${viewerId}, ${viewerUsername || 'anonymous'})
    `;

    res.json({ success: true, message: 'View tracked' });
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OFB Backend API running on port ${PORT}`);
});
