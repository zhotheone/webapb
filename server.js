const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');

// Завантаження змінних середовища
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Проміжне ПЗ - Fix CORS issues
app.use(cors({
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static('public')); // Обслуговування статичних файлів з директорії 'public'

// Підключення до MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_app';
let db;

// API ключі
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const EXCHANGERATE_API_KEY = process.env.EXCHANGERATE_API_KEY;

// Підключення до MongoDB
async function connectToDatabase() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db();
        console.log('Підключено до MongoDB');
    } catch (error) {
        console.error('Помилка підключення до MongoDB:', error);
        process.exit(1);
    }
}

// API маршрути для рейтингів
app.get('/api/rate/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        const response = await axios.get(`http://www.omdbapi.com/?s=${query}&apikey=${OMDB_API_KEY}`);
        
        if (response.data.Response === 'False') {
            return res.status(404).json({ error: response.data.Error || 'Результатів не знайдено' });

// Функція для парсингу URL товару та отримання деталей
async function parseProductUrl(url) {
    // Визначення, якому сайту належить URL
    if (url.includes('store.steampowered.com')) {
        return await parseSteamUrl(url);
    } else if (url.includes('comfy.ua')) {
        return await parseComfyUrl(url);
    } else if (url.includes('rozetka.com.ua')) {
        return await parseRozetkaUrl(url);
    } else {
        throw new Error('Непідтримуваний веб-сайт. Наразі підтримуються тільки Steam, Comfy та Rozetka.');
    }
}

// Парсинг URL Steam
async function parseSteamUrl(url) {
    try {
        console.log(`Отримання сторінки Steam: ${url}`);
        
        // Налаштування заголовків для обходу перевірки віку та примусове використання української локалі/валюти
        const headers = {
            'Accept-Language': 'uk-UA,uk;q=0.9',
            'Cookie': 'birthtime=315532800; lastagecheckage=1-0-1980; mature_content=1; wants_mature_content=1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        };
        
        // Додати параметри запиту cc та lc для примусового використання української локалі та валюти
        const separator = url.includes('?') ? '&' : '?';
        const urlWithParams = `${url}${separator}cc=UA&l=ukrainian`;
        
        console.log(`Запит URL з українською локаллю: ${urlWithParams}`);
        const response = await axios.get(urlWithParams, { headers });
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Отримання назви товару
        let productName = '';
        // Спробувати різні селектори, поки не знайдемо той, що працює
        const nameSelectors = [
            '.apphub_AppName',
            'div.page_title_area h2.pageheader', 
            '#appHubAppName',
            '.game_title_area .game_name'
        ];
        
        for (const selector of nameSelectors) {
            productName = $(selector).first().text().trim();
            if (productName) break;
        }
        
        if (!productName) {
            productName = 'Невідома гра у Steam';
        }
        
        // Отримання категорії
        let category = 'Гра';
        const genreSelectors = [
            '.details_block a[href*="genre"]',
            '.game_details_elements a[href*="genre"]',
            '.glance_tags.popular_tags a'
        ];
        
        for (const selector of genreSelectors) {
            const element = $(selector).first();
            if (element.length) {
                category = element.text().trim();
                break;
            }
        }
        
        // Отримання інформації про ціну
        let originalPrice = 0;
        let salePrice = null;
        let salePercent = null;
        let status = 'fullprice';
        
        // Перевірка на знижку
        const discountElement = $('.discount_pct, .discount_block .discount_pct');
        if (discountElement.length && discountElement.text().trim() !== '') {
            // Є знижка
            status = 'sale';
            
            // Отримання відсотка знижки
            const discountText = discountElement.text().trim().replace(/-|%/g, '');
            salePercent = parseInt(discountText, 10) || 0;
            
            // Отримання початкової ціни
            const originalPriceElement = $('.discount_original_price, .discount_prices .discount_original_price');
            if (originalPriceElement.length) {
                originalPrice = parsePrice(originalPriceElement.text().trim());
            }
            
            // Отримання ціни зі знижкою
            const salePriceElement = $('.discount_final_price, .discount_prices .discount_final_price');
            if (salePriceElement.length) {
                salePrice = parsePrice(salePriceElement.text().trim());
            }
        } else {
            // Немає знижки, лише звичайна ціна
            const priceSelectors = [
                '.game_purchase_price.price', 
                '.game_purchase_price', 
                '.price',
                '.your_price .price'
            ];
            
            for (const selector of priceSelectors) {
                const element = $(selector).first();
                if (element.length && !element.text().includes('Free') && !element.text().includes('Безкоштовно')) {
                    originalPrice = parsePrice(element.text().trim());
                    break;
                }
            }
        }
        
        // Перевірка, чи гра безкоштовна
        const freeTextSelectors = [
            '.game_area_purchase_game_wrapper',
            '.game_area_purchase_game',
            '.game_purchase_price'
        ];
        
        let isFree = false;
        for (const selector of freeTextSelectors) {
            const text = $(selector).text().toLowerCase();
            if (text.includes('free') || text.includes('безкоштовно')) {
                isFree = true;
                break;
            }
        }
        
        if (isFree) {
            status = 'free';
            originalPrice = 0;
            salePrice = 0;
        }
        
        console.log(`Проаналізовано товар Steam: ${productName}, Ціна: ${originalPrice}, Знижка: ${salePrice}, Статус: ${status}`);
        
        return {
            productName,
            category,
            price: originalPrice,
            salePrice: status === 'sale' ? salePrice : null,
            salePercent: status === 'sale' ? salePercent : null,
            status
        };
    } catch (error) {
        console.error('Помилка аналізу сторінки Steam:', error);
        throw new Error(`Не вдалося проаналізувати сторінку Steam: ${error.message}`);
    }
}

// Парсинг URL Comfy
async function parseComfyUrl(url) {
    try {
        console.log(`Отримання сторінки Comfy: ${url}`);
        
        // Налаштування комплексних заголовків для імітації реального браузера
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://comfy.ua/',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive'
        };
        
        // Створення примірника axios з таймаутом та підтримкою cookies
        const requestOptions = {
            headers,
            timeout: 10000,
            withCredentials: true
        };
        
        const response = await axios.get(url, requestOptions);
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Отримання назви товару з використанням правильного селектора
        let productName = $('.gen-tab__name').text().trim();
        
        if (!productName) {
            // Спробувати альтернативні селектори
            productName = $('.product__heading-container h1').text().trim() || 
                         $('.product-card__name').text().trim() ||
                         $('.product-header__title').text().trim();
        }
        
        // Отримання категорії
        let category = 'Електроніка';
        const breadcrumbs = $('.breadcrumbs');
        if (breadcrumbs.length) {
            // Отримати передостаній хлібний крихт як категорію
            const breadcrumbItems = breadcrumbs.find('a');
            if (breadcrumbItems.length > 1) {
                category = $(breadcrumbItems[breadcrumbItems.length - 2]).text().trim();
            }
        }
        
        // Отримання інформації про ціну з використанням правильних селекторів
        let originalPrice = 0;
        let salePrice = null;
        let salePercent = null;
        let status = 'fullprice';
        
        // Перевірка на знижку з використанням правильного селектора
        const oldPriceElement = $('.price__old-price');
        const currentPriceElement = $('.price__current');
        const discountPercentElement = $('.price__percent-discount');
        
        // Якщо є стара ціна, то є знижка
        if (oldPriceElement.length) {
            status = 'sale';
            
            // Отримання початкової ціни
            originalPrice = parsePrice(oldPriceElement.text().trim());
            
            // Отримання ціни зі знижкою
            if (currentPriceElement.length) {
                salePrice = parsePrice(currentPriceElement.text().trim());
            }
            
            // Отримання відсотка знижки безпосередньо з елемента
            if (discountPercentElement.length) {
                const discountText = discountPercentElement.text().trim().replace(/[-%]/g, '');
                salePercent = parseInt(discountText, 10);
            } else if (originalPrice > 0 && salePrice > 0) {
                // Обчислити, якщо не знайдено на сторінці
                salePercent = Math.round((1 - salePrice / originalPrice) * 100);
            }
        } else if (currentPriceElement.length) {
            // Немає знижки, лише звичайна ціна
            originalPrice = parsePrice(currentPriceElement.text().trim());
        }
        
        console.log(`Проаналізовано товар Comfy: ${productName}, Ціна: ${originalPrice}, Знижка: ${salePrice}, Статус: ${status}`);
        
        return {
            productName: productName || 'Невідомий товар Comfy',
            category,
            price: originalPrice,
            salePrice: status === 'sale' ? salePrice : null,
            salePercent: status === 'sale' ? salePercent : null,
            status
        };
    } catch (error) {
        console.error('Помилка аналізу сторінки Comfy:', error);
        throw new Error(`Не вдалося проаналізувати сторінку Comfy: ${error.message}`);
    }
}

// Парсинг URL Rozetka
async function parseRozetkaUrl(url) {
    try {
        console.log(`Отримання сторінки Rozetka: ${url}`);
        
        // Налаштування розширених заголовків у стилі браузера
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://rozetka.com.ua/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        };
        
        const response = await axios.get(url, { headers });
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Отримання назви товару з використанням правильного селектора
        // Взяти лише перший збіг заголовка
        const productName = $('.title__font').first().text().trim();
        
        // Якщо заголовок порожній, спробувати альтернативні селектори
        let finalProductName = productName;
        if (!finalProductName) {
            finalProductName = $('h1[itemprop="name"]').first().text().trim() || 
                              $('.product__title-left h1').first().text().trim();
        }
        
        // Повторна перевірка на порожні результати
        finalProductName = finalProductName || 'Невідомий товар Rozetka';
        
        // Отримання категорії
        let category = 'Електроніка';
        const breadcrumbItems = $('.breadcrumbs__item');
        if (breadcrumbItems.length > 1) {
            category = $(breadcrumbItems[breadcrumbItems.length - 2]).text().trim();
        }
        
        // Отримання інформації про ціну з використанням правильних селекторів
        let originalPrice = 0;
        let salePrice = null;
        let salePercent = null;
        let status = 'fullprice';
        
        // Перевірка на знижку - якщо є мала ціна, то є знижка
        const originalPriceElement = $('.product-price__small');
        const salePriceElement = $('.product-price__big.product-price__big-color-red');
        const regularPriceElement = $('.product-price__big:not(.product-price__big-color-red)');
        
        // Перевірка, чи товар на розпродажі
        if (originalPriceElement.length && salePriceElement.length) {
            status = 'sale';
            
            // Отримання початкової ціни
            originalPrice = parsePrice(originalPriceElement.text().trim());
            
            // Отримання ціни зі знижкою
            salePrice = parsePrice(salePriceElement.text().trim());
            
            // Спробувати отримати відсоток знижки зі сторінки
            const discountElement = $('.product-price__discount');
            if (discountElement.length) {
                const discountText = discountElement.text().trim().replace(/[-%]/g, '');
                salePercent = parseInt(discountText, 10);
            }
            
            // Якщо відсоток знижки не знайдено або некоректний, обчислити його
            if (!salePercent && originalPrice > 0 && salePrice > 0) {
                salePercent = Math.round((1 - salePrice / originalPrice) * 100);
            }
        } else if (regularPriceElement.length) {
            // Немає знижки, лише звичайна ціна
            originalPrice = parsePrice(regularPriceElement.text().trim());
        }
        
        console.log(`Проаналізовано товар Rozetka: ${finalProductName}, Ціна: ${originalPrice}, Знижка: ${salePrice}, Статус: ${status}`);
        
        return {
            productName: finalProductName,
            category,
            price: originalPrice,
            salePrice: status === 'sale' ? salePrice : null,
            salePercent: status === 'sale' ? salePercent : null,
            status
        };
    } catch (error) {
        console.error('Помилка аналізу сторінки Rozetka:', error);
        throw new Error(`Не вдалося проаналізувати сторінку Rozetka: ${error.message}`);
    }
}

// Парсинг рядка ціни у число
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    
    // Видалення символів валюти, пробілів та нечислових символів, крім . та ,
    const cleaned = priceStr.replace(/[^\d.,]/g, '');
    
    // Обробка як точки, так і коми в якості десяткового розділювача
    const withDot = cleaned.replace(',', '.');
    
    // Перетворення на число з плаваючою точкою
    const price = parseFloat(withDot);
    return isNaN(price) ? 0 : price;
}

// Отримання платформи з URL
function getPlatformFromUrl(url) {
    if (url.includes('store.steampowered.com') || url.includes('steamcommunity.com')) {
        return 'steam';
    } else if (url.includes('comfy.ua')) {
        return 'comfy';
    } else if (url.includes('rozetka.com.ua')) {
        return 'rozetka';
    } else {
        return null;
    }
}

// Отримання валюти для платформи
function getCurrencyForPlatform(platform) {
    switch(platform) {
        case 'steam':
            return '₴';
        case 'comfy':
        case 'rozetka':
            return '₴';
        default:
            return '₴';
    }
}

// Створення ID товару на основі URL
function generateProductId(url) {
    // Створення хешу URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Перетворити на 32-бітне ціле число
    }
    return 'product_' + Math.abs(hash).toString(16);
}

// Запуск сервера
(async () => {
    await connectToDatabase();
    
    app.listen(PORT, () => {
        console.log(`Сервер запущено на порту ${PORT}`);
    });
})();
        }
        
        // Трансформація даних для відповідності формату нашого фронтенду
        const results = response.data.Search.map(item => ({
            id: item.imdbID,
            title: item.Title,
            poster_path: item.Poster !== 'N/A' ? item.Poster : null,
            release_date: item.Year,
            media_type: item.Type,
            vote_average: null // OMDB пошук не включає рейтинги
        }));
        
        res.json({ results });
    } catch (error) {
        console.error('Помилка пошуку OMDB:', error);
        res.status(500).json({ error: 'Не вдалося отримати результати пошуку' });
    }
});

app.get('/api/rate/collection/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Покращена обробка sortOrder з кращим логуванням та валідацією
        const sortOrderParam = req.query.sortOrder;
        let sortOrder = 1; // За замовчуванням за зростанням (1)
        
        if (sortOrderParam === 'desc') {
            sortOrder = -1;
        } else if (sortOrderParam === 'asc') {
            sortOrder = 1;
        }
        
        // Логування параметрів сортування для налагодження
        console.log(`Запит колекції - sortOrder: ${sortOrderParam} (${sortOrder}), sortField: ${req.query.sortField || 'timestamp'}`);
        
        const sortField = req.query.sortField || 'timestamp';
        const filterType = req.query.filterType; // 'movie', 'series', тощо.
        const filterYear = req.query.filterYear; // Фільтрація за роком випуску
        const filterRating = req.query.filterRating ? parseInt(req.query.filterRating) : null; // Фільтрація за рейтингом користувача
        
        // Побудова запиту фільтрації
        const query = { userId };
        
        // Отримання всіх рейтингів для цього користувача з бази даних
        const ratingsCollection = db.collection('ratings');
        let ratings;
        
        if (filterRating) {
            // Оскільки фільтрація рейтингу потрібно робити на рівні рейтингів
            ratings = await ratingsCollection
                .find({ userId, rating: filterRating })
                .sort({ [sortField]: sortOrder })
                .toArray();
        } else {
            // Отримання всіх рейтингів і фільтрація за властивостями медіа пізніше
            ratings = await ratingsCollection
                .find(query)
                .sort({ [sortField]: sortOrder })
                .toArray();
        }
        
        // Логування результатів запиту для налагодження
        console.log(`Знайдено ${ratings.length} рейтингів для користувача ${userId}`);
            
        // Для кожного рейтингу нам потрібна повна інформація про медіа
        let results = await Promise.all(ratings.map(async (rating) => {
            // Спочатку перевіряємо, чи є у нас інформація про медіа, кешована в нашій колекції media
            let mediaInfo = await db.collection('media').findOne({ imdbId: rating.imdbId });
            
            // Якщо не знайдено в нашому кеші, отримуємо з OMDB
            if (!mediaInfo) {
                try {
                    const omdbResponse = await axios.get(`http://www.omdbapi.com/?i=${rating.imdbId}&apikey=${OMDB_API_KEY}`);
                    
                    if (omdbResponse.data.Response === 'True') {
                        mediaInfo = {
                            imdbId: omdbResponse.data.imdbID,
                            title: omdbResponse.data.Title,
                            poster: omdbResponse.data.Poster !== 'N/A' ? omdbResponse.data.Poster : null,
                            year: omdbResponse.data.Year,
                            type: omdbResponse.data.Type,
                            imdbRating: omdbResponse.data.imdbRating,
                            plot: omdbResponse.data.Plot,
                            director: omdbResponse.data.Director,
                            actors: omdbResponse.data.Actors,
                            genre: omdbResponse.data.Genre
                        };
                        
                        // Кешування інформації про медіа
                        await db.collection('media').insertOne(mediaInfo);
                    }
                } catch (error) {
                    console.error(`Помилка отримання медіа ${rating.imdbId}:`, error);
                }
            }
            
            return {
                id: rating.imdbId,
                title: mediaInfo?.title || 'Невідома назва',
                poster_path: mediaInfo?.poster || null,
                release_date: mediaInfo?.year || 'Невідомий рік',
                media_type: mediaInfo?.type || 'unknown',
                vote_average: rating.rating,
                userRating: rating.rating,
                timestamp: rating.timestamp,
                // Включення додаткових деталей для детального перегляду
                details: {
                    plot: mediaInfo?.plot || 'Опис відсутній',
                    director: mediaInfo?.director || 'Невідомо',
                    actors: mediaInfo?.actors || 'Невідомо',
                    genre: mediaInfo?.genre || 'Невідомо',
                    imdbRating: mediaInfo?.imdbRating || 'N/A'
                }
            };
        }));
        
        // Застосування додаткових фільтрів після отримання інформації про медіа
        if (filterType) {
            results = results.filter(item => 
                item.media_type && item.media_type.toLowerCase() === filterType.toLowerCase()
            );
        }
        
        if (filterYear) {
            results = results.filter(item => 
                item.release_date && item.release_date.includes(filterYear)
            );
        }
        
        // Якщо сортування за полем, яке не було в запиті MongoDB, сортуємо результати тут
        if (['title', 'release_date', 'userRating', 'media_type'].includes(sortField)) {
            // Ці поля не було в колекції MongoDB, тому сортуємо результати вручну
            results.sort((a, b) => {
                // Обробка відсутніх значень
                if (!a[sortField] && !b[sortField]) return 0;
                if (!a[sortField]) return sortOrder;
                if (!b[sortField]) return -sortOrder;
                
                // Обробка порівняння рядків (без врахування регістру)
                if (typeof a[sortField] === 'string' && typeof b[sortField] === 'string') {
                    return sortOrder * a[sortField].localeCompare(b[sortField]);
                }
                
                // Обробка числових порівнянь
                if (a[sortField] < b[sortField]) return -sortOrder;
                if (a[sortField] > b[sortField]) return sortOrder;
                return 0;
            });
        }
        
        res.json({ results });
    } catch (error) {
        console.error('Помилка отримання колекції користувача:', error);
        res.status(500).json({ error: 'Не вдалося отримати колекцію користувача', details: error.message });
    }
});

app.get('/api/rate/add/:userData', async (req, res) => {
    try {
        // Отримання об'єднаного параметра та правильний його розподіл
        const userData = req.params.userData;
        const parts = userData.split('_');
        
        if (parts.length !== 3) {
            return res.status(400).json({ 
                error: 'Неправильний формат запиту. Очікується: userId_imdbId_rating',
                details: `Отримано частин: ${parts.length}, очікувалось: 3`
            });
        }
        
        const userId = parts[0];
        const imdbId = parts[1];
        const rating = parts[2];
        
        // Конвертація рейтингу в число та валідація
        const ratingValue = parseFloat(rating);
        
        if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 10) {
            return res.status(400).json({ 
                error: 'Неправильний рейтинг. Має бути число від 0 до 10.',
                details: `Отримано: ${rating}, розпізнано як: ${ratingValue}`
            });
        }
        
        // Логування детальної інформації для налагодження
        console.log(`Додавання рейтингу: userId=${userId}, imdbId=${imdbId}, rating=${ratingValue}`);
        
        // Отримання інформації про медіа з OMDB
        try {
            const omdbResponse = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
            
            if (omdbResponse.data.Response === 'False') {
                return res.status(404).json({ 
                    error: 'Медіа не знайдено', 
                    details: omdbResponse.data.Error 
                });
            }
            
            // Зберігання інформації про медіа в нашому кеші
            const mediaInfo = {
                imdbId: omdbResponse.data.imdbID,
                title: omdbResponse.data.Title,
                poster: omdbResponse.data.Poster !== 'N/A' ? omdbResponse.data.Poster : null,
                year: omdbResponse.data.Year,
                type: omdbResponse.data.Type,
                imdbRating: omdbResponse.data.imdbRating,
                plot: omdbResponse.data.Plot,
                director: omdbResponse.data.Director,
                actors: omdbResponse.data.Actors,
                genre: omdbResponse.data.Genre
            };
            
            // Перевірка, чи вже маємо це медіа в нашому кеші
            const existingMedia = await db.collection('media').findOne({ imdbId });
            
            if (!existingMedia) {
                await db.collection('media').insertOne(mediaInfo);
            }
            
            // Перевірка, чи користувач вже оцінив це медіа
            const existingRating = await db.collection('ratings').findOne({ userId, imdbId });
            
            if (existingRating) {
                // Оновлення існуючого рейтингу
                await db.collection('ratings').updateOne(
                    { userId, imdbId },
                    { $set: { rating: ratingValue, timestamp: new Date() } }
                );
            } else {
                // Додавання нового рейтингу
                await db.collection('ratings').insertOne({
                    userId,
                    imdbId,
                    rating: ratingValue,
                    timestamp: new Date()
                });
            }
            
            res.json({ 
                success: true, 
                message: 'Рейтинг успішно додано',
                mediaInfo: {
                    id: imdbId,
                    title: mediaInfo.title,
                    poster_path: mediaInfo.poster,
                    release_date: mediaInfo.year,
                    media_type: mediaInfo.type,
                    vote_average: mediaInfo.imdbRating,
                    userRating: ratingValue
                }
            });
        } catch (error) {
            console.error('Помилка API OMDB:', error);
            res.status(500).json({ 
                error: 'Не вдалося отримати інформацію про медіа', 
                details: error.message 
            });
        }
    } catch (error) {
        console.error('Помилка додавання рейтингу:', error);
        res.status(500).json({ 
            error: 'Не вдалося додати рейтинг', 
            details: error.message 
        });
    }
});

app.delete('/api/rate/remove/:userId/:imdbId', async (req, res) => {
    try {
        const { userId, imdbId } = req.params;
        
        // Видалення рейтингу
        const result = await db.collection('ratings').deleteOne({ userId, imdbId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Рейтинг не знайдено' });
        }
        
        res.json({ success: true, message: 'Рейтинг успішно видалено' });
    } catch (error) {
        console.error('Помилка видалення рейтингу:', error);
        res.status(500).json({ error: 'Не вдалося видалити рейтинг' });
    }
});

app.get('/api/rate/filters/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Отримання всіх рейтингів для цього користувача
        const ratings = await db.collection('ratings')
            .find({ userId })
            .toArray();
            
        if (ratings.length === 0) {
            return res.json({
                mediaTypes: [],
                years: [],
                ratings: []
            });
        }
        
        // Отримання imdbIds з усіх рейтингів
        const imdbIds = ratings.map(rating => rating.imdbId);
        
        // Отримання інформації про медіа для всіх оцінених елементів
        const mediaItems = await db.collection('media')
            .find({ imdbId: { $in: imdbIds } })
            .toArray();
            
        // Видобуття унікальних типів медіа, років та рейтингів
        const mediaTypes = [...new Set(mediaItems.map(item => item.type))].filter(Boolean);
        const years = [...new Set(mediaItems.map(item => item.year))].filter(Boolean);
        const userRatings = [...new Set(ratings.map(item => item.rating))].filter(Boolean);
        
        res.json({
            mediaTypes,
            years,
            ratings: userRatings.sort((a, b) => b - a) // Сортування рейтингів за спаданням
        });
    } catch (error) {
        console.error('Помилка отримання параметрів фільтрації:', error);
        res.status(500).json({ error: 'Не вдалося отримати параметри фільтрації' });
    }
});

// API маршрут для погоди
app.get('/api/weather/:cityname', async (req, res) => {
    try {
        const cityName = req.params.cityname;
        
        // Отримання поточних даних про погоду
        const weatherResponse = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${cityName},ua&units=metric&appid=${OPENWEATHER_API_KEY}`
        );
        
        // Отримання даних прогнозу
        const forecastResponse = await axios.get(
            `https://api.openweathermap.org/data/2.5/forecast?q=${cityName},ua&units=metric&appid=${OPENWEATHER_API_KEY}`
        );
        
        // Отримання днів тижня українською
        const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        
        // Обробка поточної погоди
        const current = weatherResponse.data;
        
        // Обробка 5-денного прогнозу (один запис на день)
        const forecast = [];
        const processedDays = new Set();
        
        forecastResponse.data.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const dayOfWeek = days[date.getDay()];
            
            // Беремо тільки перший прогноз для кожного дня (виключаючи поточний день)
            if (!processedDays.has(dayOfWeek) && forecast.length < 5) {
                processedDays.add(dayOfWeek);
                
                forecast.push({
                    day: dayOfWeek,
                    condition: item.weather[0].main.toLowerCase(),
                    minTemp: Math.round(item.main.temp_min),
                    maxTemp: Math.round(item.main.temp_max)
                });
            }
        });
        
        // Форматування та відправка відповіді
        const weatherData = {
            location: current.name,
            country: current.sys.country,
            temperature: Math.round(current.main.temp),
            condition: current.weather[0].main.toLowerCase(),
            description: current.weather[0].description,
            humidity: current.main.humidity,
            windSpeed: Math.round(current.wind.speed * 3.6), // Конвертація м/с в км/г
            pressure: current.main.pressure,
            feelsLike: Math.round(current.main.feels_like),
            forecast: forecast
        };
        
        res.json(weatherData);
    } catch (error) {
        console.error('Помилка API погоди:', error);
        res.status(500).json({ error: 'Не вдалося отримати дані погоди' });
    }
});

// API маршрути для валют
app.get('/api/currency/available', async (req, res) => {
    try {
        // Отримання курсів валют з API
        const response = await axios.get(
            `https://v6.exchangerate-api.com/v6/${EXCHANGERATE_API_KEY}/latest/UAH`
        );
        
        if (!response.data || !response.data.conversion_rates) {
            return res.status(500).json({ error: 'Неправильна відповідь від API курсів валют' });
        }
        
        const rates = response.data.conversion_rates;
        const result = {};
        
        // Отримання найбільш поширених валют
        const currencies = ['UAH', 'USD', 'EUR', 'GBP', 'PLN', 'JPY', 'CHF', 'CAD', 'AUD'];
        
        currencies.forEach(currency => {
            // Для UAH ставка дорівнює 1
            if (currency === 'UAH') {
                result[currency] = { rate: 1, change: 0 };
                return;
            }
            
            // Конвертація в курс UAH (зворотний до відповіді API)
            if (rates[currency]) {
                // API дає нам X UAH = 1 [валюта], але ми хочемо 1 UAH = X [валюта]
                const rate = 1 / rates[currency];
                
                // У нас немає реальних даних про зміну, тому генеруємо випадкові дані для демонстрації
                const change = (Math.random() * 0.4 - 0.2); // Випадкова зміна між -0.2 та 0.2
                
                result[currency] = { rate, change };
            }
        });
        
        res.json(result);
    } catch (error) {
        console.error('Помилка API валют:', error);
        res.status(500).json({ error: 'Не вдалося отримати дані валют' });
    }
});

// API маршрути для трекера товарів
app.get('/api/tracker/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Отримати всі відстежувані товари для цього користувача
        const trackedItems = await db.collection('tracker').find({ userId }).toArray();
        
        res.json(trackedItems);
    } catch (error) {
        console.error('Помилка отримання відстежуваних товарів:', error);
        res.status(500).json({ error: 'Не вдалося отримати відстежувані товари' });
    }
});

app.post('/api/tracker/add', async (req, res) => {
    try {
        const { userId, url } = req.body;
        
        if (!userId || !url) {
            return res.status(400).json({ error: 'Необхідно вказати ID користувача та URL товару' });
        }
        
        console.log(`Додавання товару для користувача ${userId} з URL: ${url}`);
        
        // Аналіз URL для отримання деталей товару
        try {
            const productDetails = await parseProductUrl(url);
            
            // Створення ID товару на основі URL
            const productId = generateProductId(url);
            
            // Перевірка, чи товар вже на розпродажі
            if (productDetails.status === 'sale') {
                console.log('Товар вже на розпродажі, повідомляємо користувача');
                return res.status(200).json({ 
                    alreadyOnSale: true, 
                    message: 'Товар вже на розпродажі!',
                    saleDetails: {
                        originalPrice: productDetails.price,
                        salePrice: productDetails.salePrice,
                        salePercent: productDetails.salePercent,
                        productName: productDetails.productName
                    }
                });
            }
            
            // Перевірка, чи товар вже відстежується
            const existingProduct = await db.collection('tracker').findOne({ userId, productId });
            
            if (existingProduct) {
                // Оновлення існуючого товару
                console.log('Оновлення існуючого товару:', existingProduct.productName);
                
                await db.collection('tracker').updateOne(
                    { userId, productId },
                    { 
                        $set: {
                            url: url,
                            productName: productDetails.productName,
                            category: productDetails.category,
                            price: productDetails.price,
                            salePrice: productDetails.salePrice,
                            salePercent: productDetails.salePercent,
                            status: productDetails.status,
                            platform: getPlatformFromUrl(url),
                            updatedAt: new Date()
                        }
                    }
                );
                
                const updatedProduct = await db.collection('tracker').findOne({ userId, productId });
                return res.json(updatedProduct);
            } else {
                // Створення нового відстежуваного товару
                console.log('Створення нового товару:', productDetails.productName);
                
                const newProduct = {
                    userId,
                    productId,
                    url,
                    productName: productDetails.productName,
                    category: productDetails.category,
                    price: productDetails.price,
                    salePrice: productDetails.salePrice,
                    salePercent: productDetails.salePercent,
                    status: productDetails.status,
                    platform: getPlatformFromUrl(url),
                    currency: getCurrencyForPlatform(getPlatformFromUrl(url)),
                    dateAdded: new Date(),
                    updatedAt: new Date()
                };
                
                const result = await db.collection('tracker').insertOne(newProduct);
                newProduct._id = result.insertedId;
                
                return res.status(201).json(newProduct);
            }
        } catch (parseError) {
            console.error('Помилка аналізу URL товару:', parseError);
            return res.status(400).json({ 
                error: 'Не вдалося проаналізувати URL товару', 
                details: parseError.message 
            });
        }
    } catch (error) {
        console.error('Помилка додавання відстежуваного товару:', error);
        res.status(500).json({ error: 'Не вдалося додати відстежуваний товар' });
    }
});

app.post('/api/tracker/add/force', async (req, res) => {
    try {
        const { userId, url } = req.body;
        
        if (!userId || !url) {
            return res.status(400).json({ error: 'Необхідно вказати ID користувача та URL товару' });
        }
        
        // Аналіз URL для отримання деталей товару
        const productDetails = await parseProductUrl(url);
        
        // Створення ID товару на основі URL
        const productId = generateProductId(url);
        
        // Додавання товару незалежно від його статусу розпродажу
        const newProduct = {
            userId,
            productId,
            url,
            productName: productDetails.productName,
            category: productDetails.category,
            price: productDetails.price,
            salePrice: productDetails.salePrice,
            salePercent: productDetails.salePercent,
            status: productDetails.status,
            platform: getPlatformFromUrl(url),
            currency: getCurrencyForPlatform(getPlatformFromUrl(url)),
            dateAdded: new Date(),
            updatedAt: new Date()
        };
        
        // Перевірка, чи товар вже відстежується
        const existingProduct = await db.collection('tracker').findOne({ userId, productId });
        
        if (existingProduct) {
            // Оновлення існуючого товару
            await db.collection('tracker').updateOne(
                { userId, productId },
                { $set: newProduct }
            );
            
            const updatedProduct = await db.collection('tracker').findOne({ userId, productId });
            return res.json(updatedProduct);
        } else {
            // Додавання нового товару
            const result = await db.collection('tracker').insertOne(newProduct);
            newProduct._id = result.insertedId;
            
            return res.status(201).json(newProduct);
        }
    } catch (error) {
        console.error('Помилка додавання відстежуваного товару:', error);
        res.status(500).json({ error: 'Не вдалося додати відстежуваний товар' });
    }
});

app.delete('/api/tracker/remove/:userId/:itemId', async (req, res) => {
    try {
        const { userId, itemId } = req.params;
        
        // Перевірка, чи це ObjectId чи звичайний id
        let query = { userId };
        
        // Спробувати знайти за різними полями id
        try {
            // Якщо це ObjectId MongoDB
            if (ObjectId.isValid(itemId)) {
                query._id = new ObjectId(itemId);
            } else {
                // Звичайний id або productId
                query.$or = [
                    { id: itemId },
                    { productId: itemId }
                ];
            }
            
            // Видалення відстежуваного товару
            const result = await db.collection('tracker').deleteOne(query);
            
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Відстежуваний товар не знайдено' });
            }
            
            res.json({ success: true, message: 'Відстежуваний товар успішно видалено' });
        } catch (error) {
            console.error('Помилка видалення відстежуваного товару:', error);
            res.status(500).json({ error: 'Не вдалося видалити відстежуваний товар' });
        }
    } catch (error) {
        console.error('Помилка видалення відстежуваного товару:', error);
        res.status(500).json({ error: 'Не вдалося видалити відстежуваний товар' });
    }
});

// Start server
(async () => {
    await connectToDatabase();
    
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})();