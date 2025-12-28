import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cors from 'cors';

// Инициализация бота
const token = process.env.VITE_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Инициализация Express сервера
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ID администратора (твой Telegram ID)
const ADMIN_IDS = [5044350640];

// ============================================
// КОМАНДЫ БОТА
// ============================================

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'там';
  
  const welcomeMessage = 
    `👋 Привет, ${firstName}!\n\n` +
    `💎 Добро пожаловать в *OFB CATALOG*\n\n` +
    `Первый премиум-каталог услуг для OnlyFans индустрии\n\n` +
    `🎯 Здесь вы найдете:\n` +
    `• Проверенных специалистов по продвижению\n` +
    `• Профессиональных менеджеров\n` +
    `• Экспертов по контенту и дизайну\n` +
    `• Услуги по безопасности\n` +
    `• Техническую поддержку\n\n` +
    `📱 Нажмите кнопку ниже чтобы открыть каталог:`;
  
  bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { 
          text: '📱 Открыть каталог', 
          web_app: { url: 'https://ofbcatalog-v2.pages.dev' }
        }
      ]]
    }
  });
});

// Команда /catalog
bot.onText(/\/catalog/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, 
    '💎 *OFB CATALOG*\n\n' +
    'Премиум каталог услуг для OnlyFans индустрии\n\n' +
    '📱 Нажмите кнопку ниже чтобы открыть:', 
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { 
            text: '📱 Открыть каталог', 
            web_app: { url: 'https://ofbcatalog-v2.pages.dev' }
          }
        ]]
      }
    }
  );
});

// Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = 
    '📖 *Помощь - OFB CATALOG*\n\n' +
    '*Доступные команды:*\n\n' +
    '/start - Главное меню\n' +
    '/catalog - Открыть каталог\n' +
    '/register - Регистрация кода уведомлений\n' +
    '/help - Это сообщение\n\n' +
    '*Для специалистов:*\n' +
    '1. Откройте каталог\n' +
    '2. Нажмите "Подать заявку"\n' +
    '3. Заполните форму\n' +
    '4. Дождитесь одобрения (до 24ч)\n' +
    '5. Получите 8-значный код\n' +
    '6. Используйте /register КОД для активации уведомлений\n\n' +
    '*Для клиентов:*\n' +
    'Просто откройте каталог и выберите нужную категорию!\n\n' +
    '💬 Вопросы? Пишите @support';
  
  bot.sendMessage(chatId, helpMessage, {
    parse_mode: 'Markdown'
  });
});

// Команда /register (для регистрации кода уведомлений)
bot.onText(/\/register (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const code = match[1].trim();
  
  // Проверка формата кода (8 цифр)
  if (!/^\d{8}$/.test(code)) {
    return bot.sendMessage(chatId, 
      '❌ Неверный формат кода!\n\n' +
      'Код должен состоять из 8 цифр.\n' +
      'Пример: /register 12345678'
    );
  }
  
  // Здесь должна быть логика проверки кода в базе данных
  // и привязки Telegram ID к коду
  
  bot.sendMessage(chatId,
    '✅ Код успешно зарегистрирован!\n\n' +
    'Теперь вы будете получать уведомления о просмотрах вашего объявления.\n\n' +
    '📊 Чтобы проверить статистику, откройте каталог и перейдите в раздел "Мои объявления".'
  );
});

// Команда /announce - публикация объявления в чат (только для админов)
bot.onText(/\/announce/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  console.log('📢 /announce command received from user:', userId, 'in chat:', chatId);
  
  // Проверка что команду отправил админ
  if (!ADMIN_IDS.includes(userId)) {
    console.log('❌ User not admin:', userId);
    return bot.sendMessage(chatId, '❌ Эта команда доступна только администраторам');
  }
  
  console.log('✅ Admin verified, sending announcement...');
  
  const announcement = 
    '💎 *OFB CATALOG*\n\n' +
    'Премиум-каталог услуг для OnlyFans индустрии\n\n' +
    '🎯 *Категории:*\n' +
    '• Продвижение и SMM\n' +
    '• Менеджмент и чартинг\n' +
    '• Контент и дизайн\n' +
    '• Безопасность данных\n' +
    '• Техническая поддержка\n\n' +
    '📱 Ссылка: https://t.me/OF_Catalog_bot/OFC\n\n' +
    '👇 Или нажмите кнопку ниже:';
  
  try {
    // Отправляем сообщение с кнопкой
    const sentMessage = await bot.sendMessage(chatId, announcement, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [[
          { 
            text: '📱 Открыть каталог', 
            url: 'https://t.me/OF_Catalog_bot/OFC'
          }
        ]]
      }
    });
    
    console.log('✅ Announcement sent, message ID:', sentMessage.message_id);
    
    // Закрепляем сообщение
    await bot.pinChatMessage(chatId, sentMessage.message_id, {
      disable_notification: true
    });
    
    console.log('📌 Message pinned successfully');
    
    // Подтверждение админу в личные сообщения
    await bot.sendMessage(userId, '✅ Объявление опубликовано и закреплено в чате!');
    
  } catch (error) {
    console.error('❌ Announce error:', error);
    bot.sendMessage(userId, '❌ Ошибка при публикации: ' + error.message);
  }
});

// ============================================
// API ENDPOINTS (для фронтенда)
// ============================================

// Эндпоинт для отправки уведомлений о просмотрах
app.post('/api/notify-view', async (req, res) => {
  try {
    const { telegramId, companyName, viewerInfo } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    const message = 
      `👀 *Новый просмотр вашего объявления!*\n\n` +
      `Компания: *${companyName}*\n` +
      `Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `Откройте каталог чтобы увидеть статистику:`;
    
    await bot.sendMessage(telegramId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { 
            text: '📊 Открыть статистику', 
            web_app: { url: 'https://ofbcatalog-v2.pages.dev' }
          }
        ]]
      }
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Notify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Эндпоинт для обработки заявок
app.post('/api/submit-application', async (req, res) => {
  try {
    const { category, name, description, managerUsername, contactLink, logoData } = req.body;
    
    // Генерация 8-значного кода
    const notificationCode = Math.floor(10000000 + Math.random() * 90000000).toString();
    
    // Уведомление админам
    for (const adminId of ADMIN_IDS) {
      const adminMessage = 
        `📝 *Новая заявка на размещение!*\n\n` +
        `Категория: ${category}\n` +
        `Название: ${name}\n` +
        `Описание: ${description}\n` +
        `Telegram: @${managerUsername}\n` +
        `Код уведомлений: \`${notificationCode}\`\n\n` +
        `Отправить код заявителю после одобрения!`;
      
      await bot.sendMessage(adminId, adminMessage, {
        parse_mode: 'Markdown'
      });
    }
    
    res.json({ 
      success: true,
      message: 'Application submitted successfully',
      notificationCode: notificationCode
    });
    
  } catch (error) {
    console.error('Application error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Проверка здоровья сервера
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Корневой эндпоинт
app.get('/', (req, res) => {
  res.json({ 
    name: 'OFB Catalog Bot API',
    version: '1.0.0',
    status: 'running'
  });
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Bot @OF_Catalog_bot is active`);
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});
