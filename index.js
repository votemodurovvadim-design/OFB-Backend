import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sql } from '@vercel/postgres';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Хранилище состояний пользователей для диалоговой регистрации
const userStates = new Map();

// Telegram Bot Tokens
const MAIN_BOT_TOKEN = process.env.VITE_BOT_TOKEN; // Основной бот
const NOTIFY_BOT_TOKEN = process.env.NOTIFY_BOT_TOKEN; // Бот уведомлений
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID; // Твой Telegram ID

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Генерация уникального 8-значного кода
function generateNotifyCode() {
  const random = crypto.randomInt(10000000, 99999999); // 8 цифр
  return `OFB-${random}`;
}

// Отправка сообщения в Telegram
async function sendTelegramMessage(botToken, chatId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Telegram send error:', error);
    return null;
  }
}

// Отправка сообщения менеджеру по username
async function sendToManagerByUsername(username, message) {
  if (!MAIN_BOT_TOKEN) return { success: false };
  
  try {
    // Пытаемся найти chat_id менеджера в базе
    const result = await sql`
      SELECT DISTINCT viewer_id 
      FROM views 
      WHERE LOWER(viewer_username) = LOWER(${username})
      LIMIT 1
    `;
    
    if (result.rows.length > 0) {
      const chatId = result.rows[0].viewer_id;
      await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, message);
      return { success: true };
    }
    
    return { success: false, reason: 'not_found' };
  } catch (error) {
    console.error('Send to manager error:', error);
    return { success: false, reason: 'error' };
  }
}

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
        publish_start, publish_end, created_at, updated_at,
        notify_code, manager_telegram_id
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

    const applicationId = result.rows[0].id;

    // Отправляем уведомление админу в бот заявок
    if (NOTIFY_BOT_TOKEN && ADMIN_TELEGRAM_ID) {
      const message = `🆕 <b>Новая заявка</b>\n\n` +
                     `👤 Менеджер: @${managerUsername.replace('@', '')}`;
      
      console.log('📤 Sending notification to admin:', ADMIN_TELEGRAM_ID);
      console.log('Using bot token:', NOTIFY_BOT_TOKEN ? 'Present' : 'Missing');
      
      const sendResult = await sendTelegramMessage(NOTIFY_BOT_TOKEN, ADMIN_TELEGRAM_ID, message);
      console.log('📬 Admin notification result:', sendResult);
    } else {
      console.log('⚠️ Missing NOTIFY_BOT_TOKEN or ADMIN_TELEGRAM_ID');
      console.log('NOTIFY_BOT_TOKEN:', NOTIFY_BOT_TOKEN ? 'Present' : 'Missing');
      console.log('ADMIN_TELEGRAM_ID:', ADMIN_TELEGRAM_ID || 'Missing');
    }

    res.json({ 
      success: true, 
      message: 'Application submitted successfully',
      applicationId 
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
    
    // Генерируем 8-значный код уведомлений только при одобрении
    const notifyCode = approved ? generateNotifyCode() : null;

    await sql`
      UPDATE applications
      SET 
        status = ${newStatus},
        publish_start = ${publishStart || null},
        publish_end = ${publishEnd || null},
        notify_code = ${notifyCode},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    // Получаем данные заявки для автоотправки менеджеру
    if (approved && notifyCode) {
      const app = await sql`
        SELECT name, manager_username FROM applications WHERE id = ${id}
      `;
      
      if (app.rows.length > 0) {
        const { name, manager_username } = app.rows[0];
        
        // АВТОМАТИЧЕСКАЯ ОТПРАВКА СООБЩЕНИЯ МЕНЕДЖЕРУ
        const managerMessage = 
          `✅ <b>Ваша заявка одобрена!</b>\n\n` +
          `📋 Компания: <b>${name}</b>\n\n` +
          `🔔 Чтобы получать уведомления о просмотрах вашего объявления, введите команду:\n\n` +
          `<code>/register ${notifyCode}</code>\n\n` +
          `💾 <b>Ваш код для регистрации:</b>\n` +
          `<code>${notifyCode}</code>\n\n` +
          `⚠️ Сохраните этот код! Если потеряете - обратитесь к администратору.`;
        
        // Пытаемся отправить менеджеру
        const sendResult = await sendToManagerByUsername(manager_username, managerMessage);
        
        console.log(`Code ${notifyCode} generated for @${manager_username}. Send status:`, sendResult);
        
        // Отправляем код админу для ручной передачи (если автоотправка не удалась)
        if (!sendResult.success && NOTIFY_BOT_TOKEN && ADMIN_TELEGRAM_ID) {
          const adminMessage = 
            `✅ <b>Заявка #${id} одобрена</b>\n\n` +
            `🏢 Компания: ${name}\n` +
            `👤 Менеджер: @${manager_username}\n\n` +
            `🔑 Код для менеджера:\n<code>${notifyCode}</code>\n\n` +
            `⚠️ Менеджер еще не запускал каталог-бота. Отправьте ему код вручную.`;
          
          await sendTelegramMessage(NOTIFY_BOT_TOKEN, ADMIN_TELEGRAM_ID, adminMessage);
        }
      }
    }

    res.json({ 
      success: true, 
      message: `Application ${approved ? 'approved' : 'rejected'}`,
      notifyCode: notifyCode || undefined
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

// DELETE /api/applications/delete/:id - Удаление заявки
app.delete('/api/applications/delete/:id', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { id } = req.params;

    // Удаляем заявку
    await sql`
      DELETE FROM applications 
      WHERE id = ${id}
    `;

    res.json({ success: true, message: 'Application deleted' });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Failed to delete application' });
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

    // Сохраняем просмотр
    await sql`
      INSERT INTO views (application_id, viewer_id, viewer_username)
      VALUES (${applicationId}, ${viewerId}, ${viewerUsername || 'anonymous'})
    `;

    // Получаем данные компании и менеджера
    const app = await sql`
      SELECT name, manager_telegram_id, manager_username
      FROM applications
      WHERE id = ${applicationId}
    `;

    if (app.rows.length > 0) {
      const { name, manager_telegram_id } = app.rows[0];
      
      // Если менеджер зарегистрирован - отправляем уведомление
      if (manager_telegram_id && MAIN_BOT_TOKEN) {
        const viewerName = viewerUsername ? `@${viewerUsername.replace('@', '')}` : 'Пользователь';
        const message = `👀 <b>Новый просмотр!</b>\n\n` +
                       `🏢 Услуга: ${name}\n` +
                       `👤 Посмотрел: ${viewerName}`;
        
        await sendTelegramMessage(MAIN_BOT_TOKEN, manager_telegram_id, message);
      }
    }

    res.json({ success: true, message: 'View tracked' });
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// ==================== TELEGRAM BOT WEBHOOK ====================

// POST /api/bot/main-webhook - Webhook для основного бота
app.post('/api/bot/main-webhook', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.text) {
      return res.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from.username || 'unknown';

    // Команда /start
    if (text === '/start') {
      // Очищаем состояние при старте
      userStates.delete(chatId);
      
      const welcomeMessage = `🎯 <b>Добро пожаловать в OFB Catalog!</b>\n\n` +
                            `📱 Откройте каталог премиум-услуг для OnlyFans индустрии.\n\n` +
                            `💼 Если вы получили код активации, используйте команду:\n` +
                            `/register\n\n` +
                            `После этого просто отправьте ваш код.`;

      await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, welcomeMessage);
      return res.json({ ok: true });
    }

    // Команда /register - запрос кода
    if (text === '/register') {
      userStates.set(chatId, { waitingForCode: true });
      
      const requestMessage = `🔑 <b>Регистрация кода уведомлений</b>\n\n` +
                           `Пожалуйста, укажите свой код в формате:\n` +
                           `<code>OFB-12345678</code>\n\n` +
                           `Администратор выдаст вам код после одобрения и публикации вашей заявки.`;
      
      await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, requestMessage);
      return res.json({ ok: true });
    }

    // Проверяем, ждёт ли пользователь ввода кода
    const userState = userStates.get(chatId);
    
    // Проверка кода (с командой или без)
    const codeMatch = text.match(/^(?:\/register\s+)?(OFB-\d{8})$/i);
    if (codeMatch || (userState?.waitingForCode && text.match(/^OFB-\d{8}$/i))) {
      const code = (codeMatch ? codeMatch[1] : text).toUpperCase();
      
      // Очищаем состояние
      userStates.delete(chatId);

      // Ищем заявку с таким кодом
      const result = await sql`
        SELECT id, name, manager_username 
        FROM applications 
        WHERE UPPER(notify_code) = ${code} AND status = 'published'
      `;

      if (result.rows.length > 0) {
        const { id, name, manager_username } = result.rows[0];

        // Сохраняем telegram_id менеджера
        await sql`
          UPDATE applications 
          SET manager_telegram_id = ${chatId}
          WHERE id = ${id}
        `;

        const successMessage = `✅ <b>Регистрация успешна!</b>\n\n` +
                              `🏢 Компания: ${name}\n` +
                              `👤 Менеджер: @${manager_username.replace('@', '')}\n\n` +
                              `🔔 Теперь вы будете получать уведомления когда пользователи просматривают вашу услугу в каталоге.`;

        await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, successMessage);
      } else {
        await sendTelegramMessage(
          MAIN_BOT_TOKEN, 
          chatId, 
          '❌ <b>Код не найден</b>\n\nВозможные причины:\n• Код введён неправильно\n• Заявка ещё не одобрена\n• Код уже использован\n\nПроверьте код и попробуйте снова командой /register'
        );
      }
      return res.json({ ok: true });
    }

    // Если пользователь ждёт код, но отправил что-то не то
    if (userState?.waitingForCode) {
      await sendTelegramMessage(
        MAIN_BOT_TOKEN,
        chatId,
        '❌ Неправильный формат кода.\n\nКод должен быть в формате: <code>OFB-12345678</code>\n\nПопробуйте ещё раз или отправьте /register для новой попытки.'
      );
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Main bot webhook error:', error);
    res.json({ ok: true });
  }
});

// POST /api/bot/webhook - Webhook для бота уведомлений (deprecated)
app.post('/api/bot/webhook', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.text) {
      return res.json({ ok: true });
    }

    const chatId = message.chat.id;

    await sendTelegramMessage(
      NOTIFY_BOT_TOKEN,
      chatId,
      '👋 Этот бот больше не используется для регистрации.\n\n' +
      'Пожалуйста, используйте основной бот для регистрации кода уведомлений.'
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Bot webhook error:', error);
    res.json({ ok: true });
  }
});

// Функция polling для основного бота
let offset = 0;
async function startPolling() {
  setInterval(async () => {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${MAIN_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`
      );
      const data = await response.json();
      
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          
          // Обрабатываем сообщение
          if (update.message) {
            await handleBotMessage(update.message);
          }
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 1000); // Опрос каждую секунду
}

// Обработчик сообщений бота
async function handleBotMessage(message) {
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  
  // Команда /start
  if (text === '/start') {
    userStates.delete(chatId);
    
    const welcomeMessage = `🎯 <b>Добро пожаловать в OFB Catalog!</b>\n\n` +
                          `📱 Откройте каталог премиум-услуг для OnlyFans индустрии.\n\n` +
                          `💼 Если вы получили код активации, используйте команду:\n` +
                          `/register\n\n` +
                          `После этого просто отправьте ваш код.`;

    await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, welcomeMessage);
    return;
  }

  // Команда /register - запрос кода
  if (text === '/register') {
    userStates.set(chatId, { waitingForCode: true });
    
    const requestMessage = `🔑 <b>Регистрация кода уведомлений</b>\n\n` +
                         `Пожалуйста, укажите свой код в формате:\n` +
                         `<code>OFB-12345678</code>\n\n` +
                         `Администратор выдаст вам код после одобрения и публикации вашей заявки.`;
    
    await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, requestMessage);
    return;
  }

  // Проверяем, ждёт ли пользователь ввода кода
  const userState = userStates.get(chatId);
  
  // Проверка кода (с командой или без)
  const codeMatch = text.match(/^(?:\/register\s+)?(OFB-\d{8})$/i);
  if (codeMatch || (userState?.waitingForCode && text.match(/^OFB-\d{8}$/i))) {
    const code = (codeMatch ? codeMatch[1] : text).toUpperCase();
    
    // Очищаем состояние
    userStates.delete(chatId);

    // Ищем заявку с таким кодом
    const result = await sql`
      SELECT id, name, manager_username 
      FROM applications 
      WHERE UPPER(notify_code) = ${code} AND status = 'published'
    `;

    if (result.rows.length > 0) {
      const { id, name, manager_username } = result.rows[0];

      // Сохраняем telegram_id менеджера
      await sql`
        UPDATE applications 
        SET manager_telegram_id = ${chatId}
        WHERE id = ${id}
      `;

      const successMessage = `✅ <b>Регистрация успешна!</b>\n\n` +
                            `🏢 Компания: ${name}\n` +
                            `👤 Менеджер: @${manager_username.replace('@', '')}\n\n` +
                            `🔔 Теперь вы будете получать уведомления когда пользователи просматривают вашу услугу в каталоге.`;

      await sendTelegramMessage(MAIN_BOT_TOKEN, chatId, successMessage);
    } else {
      await sendTelegramMessage(
        MAIN_BOT_TOKEN, 
        chatId, 
        '❌ <b>Код не найден</b>\n\nВозможные причины:\n• Код введён неправильно\n• Заявка ещё не одобрена\n• Код уже использован\n\nПроверьте код и попробуйте снова командой /register'
      );
    }
    return;
  }

  // Если пользователь ждёт код, но отправил что-то не то
  if (userState?.waitingForCode) {
    await sendTelegramMessage(
      MAIN_BOT_TOKEN,
      chatId,
      '❌ Неправильный формат кода.\n\nКод должен быть в формате: <code>OFB-12345678</code>\n\nПопробуйте ещё раз или отправьте /register для новой попытки.'
    );
    return;
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 OFB Backend API running on port ${PORT}`);
  
  const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://ofb-backend.onrender.com';
  
  // Удаляем webhook для основного бота и включаем polling
  if (MAIN_BOT_TOKEN) {
    try {
      await fetch(`https://api.telegram.org/bot${MAIN_BOT_TOKEN}/deleteWebhook`);
      console.log('🔄 Main bot webhook deleted, starting polling...');
      
      // Запускаем polling
      startPolling();
    } catch (err) {
      console.error('❌ Main bot setup error:', err);
    }
  }
  
  // Устанавливаем webhook для бота уведомлений
  if (NOTIFY_BOT_TOKEN) {
    const notifyWebhookUrl = `${baseUrl}/api/bot/webhook`;
    try {
      const response = await fetch(`https://api.telegram.org/bot${NOTIFY_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: notifyWebhookUrl })
      });
      const data = await response.json();
      console.log('✅ Notify bot webhook set:', notifyWebhookUrl, data);
    } catch (err) {
      console.error('❌ Notify bot webhook error:', err);
    }
  }
  
  console.log('🎯 Backend ready! Webhooks configured.');
});
