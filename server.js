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

// CORS Configuration - Apply this first before any routes
app.use(function(req, res, next) {
  // Set headers directly to ensure they're always present
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Also use the cors middleware as a backup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Add a health check endpoint to test basic functionality
app.get('/api/healthcheck', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Other middleware
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

// Функція для парсингу URL товару та отримання деталей
async function parseProductUrl(url) {
    console.log(`Parsing URL: ${url}`);
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

/**
 * Parse Steam URL to extract product details
 * @param {string} url - Steam product URL
 * @returns {object} - Product details
 */
async function parseSteamUrl(url) {
  try {
    console.log(`Fetching Steam page: ${url}`);
    
    // Set up headers to bypass age check and force Ukrainian locale/currency
    const headers = {
      'Accept-Language': 'uk-UA,uk;q=0.9',
      'Cookie': 'birthtime=315532800; lastagecheckage=1-0-1980; mature_content=1; wants_mature_content=1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };
    
    // Add cc and lc query parameters to force Ukrainian locale and currency
    const separator = url.includes('?') ? '&' : '?';
    const urlWithParams = `${url}${separator}cc=UA&l=ukrainian`;
    
    console.log(`Requesting URL with Ukrainian locale: ${urlWithParams}`);
    const response = await axios.get(urlWithParams, { headers });
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract product name - FIX: Handle doubled product names
    let productName = '';
    // Try multiple selectors until we find one that works
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
      productName = 'Unknown Steam Game';
    }
    
    // Extract category
    let category = 'Game';
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
    
    // Extract price information - handle different layouts
    let originalPrice = 0;
    let salePrice = null;
    let salePercent = null;
    let status = 'fullprice';
    
    // Check for discount
    const discountElement = $('.discount_pct, .discount_block .discount_pct');
    if (discountElement.length && discountElement.text().trim() !== '') {
      // There is a discount
      status = 'sale';
      
      // Extract discount percentage
      const discountText = discountElement.text().trim().replace(/-|%/g, '');
      salePercent = parseInt(discountText, 10) || 0;
      
      // Extract original price
      const originalPriceElement = $('.discount_original_price, .discount_prices .discount_original_price');
      if (originalPriceElement.length) {
        originalPrice = parsePrice(originalPriceElement.text().trim());
      }
      
      // Extract sale price
      const salePriceElement = $('.discount_final_price, .discount_prices .discount_final_price');
      if (salePriceElement.length) {
        salePrice = parsePrice(salePriceElement.text().trim());
      }
    } else {
      // No discount, just regular price
      const priceSelectors = [
        '.game_purchase_price.price', 
        '.game_purchase_price', 
        '.price',
        '.your_price .price'
      ];
      
      for (const selector of priceSelectors) {
        const element = $(selector).first();
        if (element.length && !element.text().includes('Free')) {
          originalPrice = parsePrice(element.text().trim());
          break;
        }
      }
    }
    
    // Check if free to play
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
    
    console.log(`Parsed Steam product: ${productName}, Price: ${originalPrice}, Sale: ${salePrice}, Status: ${status}`);
    
    return {
      productName,
      category,
      price: originalPrice,
      salePrice: status === 'sale' ? salePrice : null,
      salePercent: status === 'sale' ? salePercent : null,
      status
    };
  } catch (error) {
    console.error('Error parsing Steam page:', error);
    throw new Error(`Failed to parse Steam page: ${error.message}`);
  }
}

/**
 * Parse Comfy URL to extract product details
 * @param {string} url - Comfy product URL
 * @returns {object} - Product details
 */
async function parseComfyUrl(url) {
  try {
    console.log(`Fetching Comfy page: ${url}`);
    
    // Set more comprehensive headers to mimic a real browser
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://comfy.ua/',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'Sec-Ch-Ua': '"Chromium";v="98", " Not A;Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };
    
    // Create axios instance with a timeout and cookies enabled
    const requestOptions = {
      headers,
      timeout: 10000,
      withCredentials: true
    };
    
    const response = await axios.get(url, requestOptions);
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract product name using the correct selector
    let productName = $('.gen-tab__name').text().trim();
    
    if (!productName) {
      // Try alternative selectors
      productName = $('.product__heading-container h1').text().trim() || 
                   $('.product-card__name').text().trim() ||
                   $('.product-header__title').text().trim();
    }
    
    // Extract category
    let category = 'Electronics';
    const breadcrumbs = $('.breadcrumbs');
    if (breadcrumbs.length) {
      // Get the second-to-last breadcrumb as the category
      const breadcrumbItems = breadcrumbs.find('a');
      if (breadcrumbItems.length > 1) {
        category = $(breadcrumbItems[breadcrumbItems.length - 2]).text().trim();
      }
    }
    
    // Extract price information using the correct selectors
    let originalPrice = 0;
    let salePrice = null;
    let salePercent = null;
    let status = 'fullprice';
    
    // Check for discount using the correct selector
    const oldPriceElement = $('.price__old-price');
    const currentPriceElement = $('.price__current');
    const discountPercentElement = $('.price__percent-discount');
    
    // If old price exists, there's a sale
    if (oldPriceElement.length) {
      status = 'sale';
      
      // Extract original price
      originalPrice = parsePrice(oldPriceElement.text().trim());
      
      // Extract sale price
      if (currentPriceElement.length) {
        salePrice = parsePrice(currentPriceElement.text().trim());
      }
      
      // Get the discount percentage directly from the element
      if (discountPercentElement.length) {
        const discountText = discountPercentElement.text().trim().replace(/[-%]/g, '');
        salePercent = parseInt(discountText, 10);
      } else if (originalPrice > 0 && salePrice > 0) {
        // Calculate if not found on the page
        salePercent = Math.round((1 - salePrice / originalPrice) * 100);
      }
    } else if (currentPriceElement.length) {
      // No discount, just regular price
      originalPrice = parsePrice(currentPriceElement.text().trim());
    }
    
    console.log(`Parsed Comfy product: ${productName}, Price: ${originalPrice}, Sale: ${salePrice}, Status: ${status}`);
    
    return {
      productName: productName || 'Unknown Comfy Product',
      category,
      price: originalPrice,
      salePrice: status === 'sale' ? salePrice : null,
      salePercent: status === 'sale' ? salePercent : null,
      status
    };
  } catch (error) {
    console.error('Error parsing Comfy page:', error);
    throw new Error(`Failed to parse Comfy page: ${error.message}`);
  }
}

/**
 * Parse Rozetka URL to extract product details
 * @param {string} url - Rozetka product URL
 * @returns {object} - Product details
 */
async function parseRozetkaUrl(url) {
  try {
    console.log(`Fetching Rozetka page: ${url}`);
    
    // Set enhanced browser-like headers
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
    
    // Extract product name using the correct selector and avoid duplication
    // Take only the first match of the title
    const productName = $('.title__font').first().text().trim();
    
    // If the title is empty, try alternative selectors
    let finalProductName = productName;
    if (!finalProductName) {
      finalProductName = $('h1[itemprop="name"]').first().text().trim() || 
                        $('.product__title-left h1').first().text().trim();
    }
    
    // Double-check for empty results
    finalProductName = finalProductName || 'Unknown Rozetka Product';
    
    // Extract category
    let category = 'Electronics';
    const breadcrumbItems = $('.breadcrumbs__item');
    if (breadcrumbItems.length > 1) {
      category = $(breadcrumbItems[breadcrumbItems.length - 2]).text().trim();
    }
    
    // Extract price information using the correct selectors
    let originalPrice = 0;
    let salePrice = null;
    let salePercent = null;
    let status = 'fullprice';
    
    // Check for discount - if small price exists, there's a sale
    const originalPriceElement = $('.product-price__small');
    const salePriceElement = $('.product-price__big.product-price__big-color-red');
    const regularPriceElement = $('.product-price__big:not(.product-price__big-color-red)');
    
    // Check if the product is on sale
    if (originalPriceElement.length && salePriceElement.length) {
      status = 'sale';
      
      // Extract original price
      originalPrice = parsePrice(originalPriceElement.text().trim());
      
      // Extract sale price
      salePrice = parsePrice(salePriceElement.text().trim());
      
      // Try to get the discount percentage from the page
      const discountElement = $('.product-price__discount');
      if (discountElement.length) {
        const discountText = discountElement.text().trim().replace(/[-%]/g, '');
        salePercent = parseInt(discountText, 10);
      }
      
      // If discount percentage not found or invalid, calculate it
      if (!salePercent && originalPrice > 0 && salePrice > 0) {
        salePercent = Math.round((1 - salePrice / originalPrice) * 100);
      }
    } else if (regularPriceElement.length) {
      // No discount, just regular price
      originalPrice = parsePrice(regularPriceElement.text().trim());
    }
    
    console.log(`Parsed Rozetka product: ${finalProductName}, Price: ${originalPrice}, Sale: ${salePrice}, Status: ${status}`);
    
    return {
      productName: finalProductName,
      category,
      price: originalPrice,
      salePrice: status === 'sale' ? salePrice : null,
      salePercent: status === 'sale' ? salePercent : null,
      status
    };
  } catch (error) {
    console.error('Error parsing Rozetka page:', error);
    throw new Error(`Failed to parse Rozetka page: ${error.message}`);
  }
}

/**
 * Parse price string to number
 * @param {string} priceStr - Price string (e.g., "₴199.99", "199,99₴", "199 грн")
 * @returns {number} - Price as number
 */
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    
    // Remove currency symbols, spaces, and non-numeric characters except for . and ,
    const cleaned = priceStr.replace(/[^\d.,]/g, '');
    
    // Handle both dot and comma as decimal separator
    const withDot = cleaned.replace(',', '.');
    
    // Parse to float
    const price = parseFloat(withDot);
    return isNaN(price) ? 0 : price;
  }

// Отримання платформи з URL
function getPlatformFromURL(url) {
    if (!url) {
        console.warn('Empty URL provided to getPlatformFromURL');
        return null;
    }

    try {
        const lowercaseUrl = url.toLowerCase();

        // Steam platform detection
        if (lowercaseUrl.includes('store.steampowered.com') || 
            lowercaseUrl.includes('steamcommunity.com')) {
            return 'steam';
        } 
        
        // Comfy platform detection
        else if (lowercaseUrl.includes('comfy.ua')) {
            return 'comfy';
        } 
        
        // Rozetka platform detection
        else if (lowercaseUrl.includes('rozetka.com.ua')) {
            return 'rozetka';
        }
        
        // Unknown platform
        console.warn(`Unknown platform for URL: ${url}`);
        return null;
    } catch (error) {
        console.error('Error in getPlatformFromURL:', error);
        return null;
    }
}

// Отримання валюти для платформи
function getCurrencyForPlatform(platform) {
    if (!platform) {
        console.warn('Empty platform provided to getCurrencyForPlatform');
        return '₴'; // Default to Ukrainian Hryvnia
    }

    // Currency mapping for each platform
    const currencyMap = {
        'steam': '₴',    // Ukrainian Hryvnia for Steam
        'comfy': '₴',    // Ukrainian Hryvnia for Comfy
        'rozetka': '₴',  // Ukrainian Hryvnia for Rozetka
    };

    // Get the currency or default to Ukrainian Hryvnia if platform not found
    const currency = currencyMap[platform.toLowerCase()] || '₴';
    
    return currency;
}

/**
 * Generate a stable product ID from URL
 * @param {string} url - Product URL
 * @returns {string} - Generated product ID
 */
function generateProductId(url) {
    // Extract the domain and path
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname;
      
      // Remove trailing slash
      if (path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      
      // Extract the last part of the path for most product URLs
      const parts = path.split('/');
      const lastPart = parts[parts.length - 1];
      
      if (url.includes('store.steampowered.com')) {
        // For Steam, use app/{id} format
        const appIdMatch = url.match(/app\/(\d+)/);
        if (appIdMatch && appIdMatch[1]) {
          return `steam_${appIdMatch[1]}`;
        }
      }
      
      // Default: use domain + last part of path
      const domain = urlObj.hostname.replace('www.', '');
      return `${domain}_${lastPart}`;
    } catch (error) {
      // Fallback: hash the URL
      return `product_${Math.abs(hashCode(url))}`;
    }
  }
  
  /**
   * Simple string hash function
   */
  function hashCode(str) {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
      let chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

// API маршрути для рейтингів
app.get('/api/rate/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        const response = await axios.get(`http://www.omdbapi.com/?s=${query}&apikey=${OMDB_API_KEY}`);
        
        if (response.data.Response === 'False') {
            return res.status(404).json({ error: response.data.Error || 'Результатів не знайдено' });
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
                            platform: getPlatformFromURL(url),
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
                    platform: getPlatformFromURL(url),
                    currency: getCurrencyForPlatform(getPlatformFromURL(url)),
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
            platform: getPlatformFromURL(url),
            currency: getCurrencyForPlatform(getPlatformFromURL(url)),
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

// Image proxy endpoint to handle CORS issues with external images
app.get('/api/image-proxy', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        
        if (!imageUrl) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }
        
        // Validate the URL (optional - for security)
        try {
            new URL(imageUrl);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }
        
        // Whitelist domains for security (add more as needed)
        const allowedDomains = [
            'm.media-amazon.com',
            'image.tmdb.org',
            'images-na.ssl-images-amazon.com'
        ];
        
        const urlObj = new URL(imageUrl);
        const domain = urlObj.hostname;
        
        if (!allowedDomains.some(allowed => domain.includes(allowed))) {
            return res.status(403).json({ 
                error: 'Domain not in whitelist',
                message: `The domain ${domain} is not in the allowed domains list`
            });
        }
        
        console.log(`Proxying image from: ${imageUrl}`);
        
        // Get the image and pipe it through
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'stream',
            validateStatus: (status) => status < 500 // Accept 404 responses
        });

        if (response.status === 404) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        // Set appropriate headers
        res.set('Content-Type', response.headers['content-type']);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        
        // Pipe the image data to the response
        response.data.pipe(res);
        
    } catch (error) {
        console.error('Image proxy error:', error);
        
        // If the response has already been sent, don't try to send another
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to retrieve image',
                details: error.message
            });
        }
    }
});

// Add this to your server.js file

// Media Statistics Endpoint 
app.get('/api/rate/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get all ratings for this user
        const ratings = await db.collection('ratings')
            .find({ userId })
            .toArray();
            
        if (ratings.length === 0) {
            return res.json({
                totalMedia: 0,
                totalMovies: 0,
                totalSeries: 0,
                totalGames: 0,
                totalHours: 0,
                averageRating: "0.0",
                ratingDistribution: {},
                yearDistribution: {},
                favoriteGenres: [],
                favoriteDirectors: []
            });
        }
        
        // Get imdbIds from all ratings
        const imdbIds = ratings.map(rating => rating.imdbId);
        
        // Get information about all rated media
        const mediaItems = await db.collection('media')
            .find({ imdbId: { $in: imdbIds } })
            .toArray();
            
        // Create a map for quick media lookups
        const mediaMap = {};
        mediaItems.forEach(item => {
            mediaMap[item.imdbId] = item;
        });
        
        // Calculate statistics
        const totalMedia = ratings.length;
        
        // Count by media type
        let totalMovies = 0;
        let totalSeries = 0;
        let totalGames = 0;
        
        // Rating distribution (counts by rating value)
        const ratingDistribution = {};
        
        // Year distribution (counts by release year)
        const yearDistribution = {};
        
        // Count genres and directors
        const genreCount = {};
        const directorCount = {};
        
        // Calculate estimated watch hours (rough approximation)
        let totalHours = 0;
        
        // Process each rating
        ratings.forEach(rating => {
            const media = mediaMap[rating.imdbId];
            if (media) {
                // Count by type
                const mediaType = media.type ? media.type.toLowerCase() : 'unknown';
                if (mediaType === 'movie') {
                    totalMovies++;
                    // Approximate movie length (2 hours)
                    totalHours += 2;
                } else if (mediaType === 'series' || mediaType === 'tvshow' || mediaType === 'tv') {
                    totalSeries++;
                    // Approximate series length (10 episodes x 1 hour)
                    totalHours += 10;
                } else if (mediaType === 'game') {
                    totalGames++;
                    // Approximate game length (20 hours)
                    totalHours += 20;
                }
                
                // Process release year
                if (media.year) {
                    yearDistribution[media.year] = (yearDistribution[media.year] || 0) + 1;
                }
                
                // Process genres
                if (media.genre) {
                    const genres = media.genre.split(', ');
                    genres.forEach(genre => {
                        genreCount[genre] = (genreCount[genre] || 0) + 1;
                    });
                }
                
                // Process director
                if (media.director) {
                    const directors = media.director.split(', ');
                    directors.forEach(director => {
                        if (director !== 'N/A') {
                            directorCount[director] = (directorCount[director] || 0) + 1;
                        }
                    });
                }
            }
            
            // Count ratings
            if (rating.rating) {
                ratingDistribution[rating.rating] = (ratingDistribution[rating.rating] || 0) + 1;
            }
        });
        
        // Calculate average rating (excluding null/undefined ratings)
        const ratedItems = ratings.filter(rating => rating.rating !== null && rating.rating !== undefined);
        const averageRating = ratedItems.length > 0 
            ? (ratedItems.reduce((sum, item) => sum + item.rating, 0) / ratedItems.length).toFixed(1)
            : "0.0";
        
        // Get top genres and directors
        const favoriteGenres = Object.entries(genreCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([genre, count]) => ({ genre, count }));
            
        const favoriteDirectors = Object.entries(directorCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([director, count]) => ({ director, count }));
        
        res.json({
            totalMedia,
            totalMovies,
            totalSeries,
            totalGames,
            totalHours,
            averageRating,
            ratingDistribution,
            yearDistribution,
            favoriteGenres,
            favoriteDirectors
        });
    } catch (error) {
        console.error('Помилка отримання статистики медіа:', error);
        res.status(500).json({ error: 'Не вдалося отримати статистику медіа' });
    }
});

// Book API Endpoints
// To be added to server.js

// API key for Google Books
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || 'YOUR_API_KEY';

// Book Search Endpoint
app.get('/api/books/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        const response = await axios.get(
            `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${GOOGLE_BOOKS_API_KEY}`
        );
        
        if (!response.data.items || response.data.items.length === 0) {
            return res.status(404).json({ error: 'Результатів не знайдено' });
        }
        
        // Transform data to match our format
        const results = response.data.items.map(item => ({
            id: item.id,
            title: item.volumeInfo.title,
            authors: item.volumeInfo.authors || ['Невідомий автор'],
            publisher: item.volumeInfo.publisher || 'Невідомо',
            publishedDate: item.volumeInfo.publishedDate || 'Невідомо',
            description: item.volumeInfo.description || 'Опис відсутній',
            pageCount: item.volumeInfo.pageCount || 0,
            categories: item.volumeInfo.categories || ['Невідомо'],
            language: item.volumeInfo.language || 'uk',
            image: item.volumeInfo.imageLinks ? 
                (item.volumeInfo.imageLinks.thumbnail || item.volumeInfo.imageLinks.smallThumbnail) : 
                null,
            type: item.volumeInfo.categories && 
                  item.volumeInfo.categories.some(cat => 
                    cat.toLowerCase().includes('manga') || 
                    cat.toLowerCase().includes('comic')
                  ) ? 'manga' : 'book',
            infoLink: item.volumeInfo.infoLink || null,
            averageRating: item.volumeInfo.averageRating || null
        }));
        
        res.json({ results });
    } catch (error) {
        console.error('Помилка пошуку книг:', error);
        res.status(500).json({ error: 'Не вдалося отримати результати пошуку книг' });
    }
});

// Get Book Collection for User
app.get('/api/books/collection/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Parse sorting options
        const sortOrderParam = req.query.sortOrder;
        let sortOrder = 1; // Ascending by default
        
        if (sortOrderParam === 'desc') {
            sortOrder = -1;
        }
        
        console.log(`Запит колекції книг - sortOrder: ${sortOrderParam} (${sortOrder}), sortField: ${req.query.sortField || 'timestamp'}`);
        
        const sortField = req.query.sortField || 'timestamp';
        const filterType = req.query.filterType; // 'book', 'manga'
        const filterYear = req.query.filterYear; // Filter by publication year
        const filterRating = req.query.filterRating ? parseInt(req.query.filterRating) : null; // Filter by user rating
        const filterAuthor = req.query.filterAuthor; // Filter by author
        const filterCategory = req.query.filterCategory; // Filter by category
        const filterLanguage = req.query.filterLanguage; // Filter by language
        
        // Query preparation
        const query = { userId };
        
        // Get all books for this user
        const booksCollection = db.collection('book_ratings');
        let ratings;
        
        if (filterRating) {
            ratings = await booksCollection
                .find({ userId, rating: filterRating })
                .sort({ [sortField]: sortOrder })
                .toArray();
        } else {
            ratings = await booksCollection
                .find(query)
                .sort({ [sortField]: sortOrder })
                .toArray();
        }
        
        console.log(`Знайдено ${ratings.length} книжкових рейтингів для користувача ${userId}`);
            
        // Get full book info for each rating
        let results = await Promise.all(ratings.map(async (rating) => {
            // Check if we have book info cached in our books collection
            let bookInfo = await db.collection('books').findOne({ bookId: rating.bookId });
            
            // If not found in our cache, get it from Google Books
            if (!bookInfo) {
                try {
                    const response = await axios.get(
                        `https://www.googleapis.com/books/v1/volumes/${rating.bookId}?key=${GOOGLE_BOOKS_API_KEY}`
                    );
                    
                    if (response.data) {
                        const item = response.data;
                        bookInfo = {
                            bookId: item.id,
                            title: item.volumeInfo.title,
                            authors: item.volumeInfo.authors || ['Невідомий автор'],
                            publisher: item.volumeInfo.publisher || 'Невідомо',
                            publishedDate: item.volumeInfo.publishedDate || 'Невідомо',
                            description: item.volumeInfo.description || 'Опис відсутній',
                            pageCount: item.volumeInfo.pageCount || 0,
                            categories: item.volumeInfo.categories || ['Невідомо'],
                            language: item.volumeInfo.language || 'uk',
                            image: item.volumeInfo.imageLinks ? 
                                (item.volumeInfo.imageLinks.thumbnail || item.volumeInfo.imageLinks.smallThumbnail) : 
                                null,
                            type: item.volumeInfo.categories && 
                                  item.volumeInfo.categories.some(cat => 
                                    cat.toLowerCase().includes('manga') || 
                                    cat.toLowerCase().includes('comic')
                                  ) ? 'manga' : 'book',
                            infoLink: item.volumeInfo.infoLink || null,
                            averageRating: item.volumeInfo.averageRating || null
                        };
                        
                        // Cache book info
                        await db.collection('books').insertOne(bookInfo);
                    }
                } catch (error) {
                    console.error(`Помилка отримання книги ${rating.bookId}:`, error);
                }
            }
            
            // Extract year from publishedDate (assuming format YYYY or YYYY-MM-DD)
            let publicationYear = null;
            if (bookInfo?.publishedDate) {
                const match = bookInfo.publishedDate.match(/^(\d{4})/);
                if (match) {
                    publicationYear = match[1];
                }
            }
            
            return {
                id: rating.bookId,
                title: bookInfo?.title || 'Невідома назва',
                authors: bookInfo?.authors || ['Невідомий автор'],
                publisher: bookInfo?.publisher || 'Невідомо',
                publishedDate: bookInfo?.publishedDate || 'Невідомо',
                publicationYear,
                description: bookInfo?.description || 'Опис відсутній',
                pageCount: bookInfo?.pageCount || 0,
                categories: bookInfo?.categories || ['Невідомо'],
                language: bookInfo?.language || 'uk',
                image: bookInfo?.image || null,
                type: bookInfo?.type || 'book',
                infoLink: bookInfo?.infoLink || null,
                userRating: rating.rating,
                userReview: rating.review || '',  // Include the user's review
                timestamp: rating.timestamp,
                readingStatus: rating.readingStatus || 'finished', // 'reading', 'to-read', 'finished'
                notes: rating.notes || '',
                details: {
                    description: bookInfo?.description || 'Опис відсутній',
                    pageCount: bookInfo?.pageCount || 0,
                    publisher: bookInfo?.publisher || 'Невідомо',
                    categories: bookInfo?.categories || ['Невідомо'],
                    language: bookInfo?.language || 'uk',
                    averageRating: bookInfo?.averageRating || 'Немає оцінок'
                }
            };
        }));
        
        // Apply additional filters after getting book info
        if (filterType) {
            results = results.filter(item => 
                item.type && item.type.toLowerCase() === filterType.toLowerCase()
            );
        }
        
        if (filterYear) {
            results = results.filter(item => 
                item.publicationYear && item.publicationYear === filterYear
            );
        }
        
        if (filterAuthor) {
            results = results.filter(item => 
                item.authors && item.authors.some(author => 
                    author.toLowerCase().includes(filterAuthor.toLowerCase())
                )
            );
        }
        
        if (filterCategory) {
            results = results.filter(item => 
                item.categories && item.categories.some(category => 
                    category.toLowerCase().includes(filterCategory.toLowerCase())
                )
            );
        }
        
        if (filterLanguage) {
            results = results.filter(item => 
                item.language && item.language.toLowerCase() === filterLanguage.toLowerCase()
            );
        }
        
        // Manual sorting for some fields that weren't in MongoDB query
        if (['title', 'publishedDate', 'userRating', 'authors'].includes(sortField)) {
            results.sort((a, b) => {
                // Handle missing values
                if (!a[sortField] && !b[sortField]) return 0;
                if (!a[sortField]) return sortOrder;
                if (!b[sortField]) return -sortOrder;
                
                // Special handling for authors array
                if (sortField === 'authors') {
                    const authorA = a.authors[0] || '';
                    const authorB = b.authors[0] || '';
                    return sortOrder * authorA.localeCompare(authorB);
                }
                
                // String comparison (case-insensitive)
                if (typeof a[sortField] === 'string' && typeof b[sortField] === 'string') {
                    return sortOrder * a[sortField].localeCompare(b[sortField]);
                }
                
                // Numeric comparison
                if (a[sortField] < b[sortField]) return -sortOrder;
                if (a[sortField] > b[sortField]) return sortOrder;
                return 0;
            });
        }
        
        res.json({ results });
    } catch (error) {
        console.error('Помилка отримання колекції книг користувача:', error);
        res.status(500).json({ error: 'Не вдалося отримати колекцію книг користувача', details: error.message });
    }
});

app.post('/api/books/rate', async (req, res) => {
    try {
        const { userId, bookId, rating, readingStatus, notes, review } = req.body;
        
        if (!userId || !bookId) {
            return res.status(400).json({ 
                error: 'Необхідно вказати userId та bookId',
                details: 'Відсутні обов\'язкові параметри'
            });
        }
        
        // Validate rating
        const ratingValue = parseFloat(rating);
        if (rating !== undefined && (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 10)) {
            return res.status(400).json({ 
                error: 'Неправильний рейтинг. Має бути число від 0 до 10.',
                details: `Отримано: ${rating}, розпізнано як: ${ratingValue}`
            });
        }
        
        // Validate reading status
        const validStatuses = ['reading', 'to-read', 'finished'];
        if (readingStatus && !validStatuses.includes(readingStatus)) {
            return res.status(400).json({ 
                error: 'Неправильний статус читання',
                details: `Отримано: ${readingStatus}. Допустимі значення: ${validStatuses.join(', ')}`
            });
        }
        
        // Validate review length if provided
        if (review && review.length > 2000) {
            return res.status(400).json({ 
                error: 'Рецензія занадто довга',
                details: 'Максимальна довжина рецензії - 2000 символів'
            });
        }
        
        console.log(`Додавання/оновлення книги: userId=${userId}, bookId=${bookId}, rating=${ratingValue}, status=${readingStatus}, review=${review ? 'Так' : 'Ні'}`);
        
        // Get book information from Google Books
        try {
            const bookResponse = await axios.get(
                `https://www.googleapis.com/books/v1/volumes/${bookId}?key=${GOOGLE_BOOKS_API_KEY}`
            );
            
            if (!bookResponse.data) {
                return res.status(404).json({ 
                    error: 'Книгу не знайдено', 
                    details: 'Google Books API не знайшло книгу'
                });
            }
            
            // Store book info in our cache
            const item = bookResponse.data;
            const bookInfo = {
                bookId: item.id,
                title: item.volumeInfo.title,
                authors: item.volumeInfo.authors || ['Невідомий автор'],
                publisher: item.volumeInfo.publisher || 'Невідомо',
                publishedDate: item.volumeInfo.publishedDate || 'Невідомо',
                description: item.volumeInfo.description || 'Опис відсутній',
                pageCount: item.volumeInfo.pageCount || 0,
                categories: item.volumeInfo.categories || ['Невідомо'],
                language: item.volumeInfo.language || 'uk',
                image: item.volumeInfo.imageLinks ? 
                    (item.volumeInfo.imageLinks.thumbnail || item.volumeInfo.imageLinks.smallThumbnail) : 
                    null,
                type: item.volumeInfo.categories && 
                      item.volumeInfo.categories.some(cat => 
                        cat.toLowerCase().includes('manga') || 
                        cat.toLowerCase().includes('comic')
                      ) ? 'manga' : 'book',
                infoLink: item.volumeInfo.infoLink || null,
                averageRating: item.volumeInfo.averageRating || null
            };
            
            // Check if we already have this book in cache
            const existingBook = await db.collection('books').findOne({ bookId });
            
            if (!existingBook) {
                await db.collection('books').insertOne(bookInfo);
            } else {
                // Update existing book info
                await db.collection('books').updateOne(
                    { bookId },
                    { $set: bookInfo }
                );
            }
            
            // Check if user already rated this book
            const existingRating = await db.collection('book_ratings').findOne({ userId, bookId });
            
            const updateData = {
                timestamp: new Date()
            };
            
            // Only add fields that are provided
            if (rating !== undefined) updateData.rating = ratingValue;
            if (readingStatus) updateData.readingStatus = readingStatus;
            if (notes !== undefined) updateData.notes = notes;
            if (review !== undefined) updateData.review = review;
            
            if (existingRating) {
                // Update existing rating
                await db.collection('book_ratings').updateOne(
                    { userId, bookId },
                    { $set: updateData }
                );
            } else {
                // Add new rating
                await db.collection('book_ratings').insertOne({
                    userId,
                    bookId,
                    rating: rating !== undefined ? ratingValue : null,
                    readingStatus: readingStatus || 'finished',
                    notes: notes || '',
                    review: review || '',
                    timestamp: new Date()
                });
            }
            
            res.json({ 
                success: true, 
                message: 'Оцінку та рецензію успішно додано',
                bookInfo: {
                    id: bookId,
                    title: bookInfo.title,
                    authors: bookInfo.authors,
                    publishedDate: bookInfo.publishedDate,
                    image: bookInfo.image,
                    type: bookInfo.type,
                    averageRating: bookInfo.averageRating,
                    userRating: rating !== undefined ? ratingValue : null,
                    readingStatus: readingStatus || 'finished',
                    notes: notes || '',
                    review: review || ''
                }
            });
        } catch (error) {
            console.error('Помилка Google Books API:', error);
            res.status(500).json({ 
                error: 'Не вдалося отримати інформацію про книгу', 
                details: error.message 
            });
        }
    } catch (error) {
        console.error('Помилка додавання/оновлення оцінки книги:', error);
        res.status(500).json({ 
            error: 'Не вдалося додати/оновити оцінку книги', 
            details: error.message 
        });
    }
});

// Remove Book Rating
app.delete('/api/books/remove/:userId/:bookId', async (req, res) => {
    try {
        const { userId, bookId } = req.params;
        
        // Delete the rating
        const result = await db.collection('book_ratings').deleteOne({ userId, bookId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Оцінку книги не знайдено' });
        }
        
        res.json({ success: true, message: 'Оцінку книги успішно видалено' });
    } catch (error) {
        console.error('Помилка видалення оцінки книги:', error);
        res.status(500).json({ error: 'Не вдалося видалити оцінку книги' });
    }
});

// Get Book Filter Options
app.get('/api/books/filters/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get all book ratings for this user
        const ratings = await db.collection('book_ratings')
            .find({ userId })
            .toArray();
            
        if (ratings.length === 0) {
            return res.json({
                types: [],
                years: [],
                ratings: [],
                authors: [],
                categories: [],
                languages: []
            });
        }
        
        // Get bookIds from all ratings
        const bookIds = ratings.map(rating => rating.bookId);
        
        // Get information about all rated books
        const books = await db.collection('books')
            .find({ bookId: { $in: bookIds } })
            .toArray();
            
        // Extract unique values
        const types = [...new Set(books.map(book => book.type))].filter(Boolean);
        
        // Extract years from publishedDate
        const years = [...new Set(books
            .map(book => {
                if (!book.publishedDate) return null;
                const match = book.publishedDate.match(/^(\d{4})/);
                return match ? match[1] : null;
            })
            .filter(Boolean))];
        
        // Extract unique user ratings
        const userRatings = [...new Set(ratings
            .map(item => item.rating)
            .filter(rating => rating !== null && rating !== undefined))];
        
        // Extract unique authors (flattened from author arrays)
        const allAuthors = books.flatMap(book => book.authors || []).filter(Boolean);
        const authors = [...new Set(allAuthors)];
        
        // Extract unique categories (flattened from category arrays)
        const allCategories = books.flatMap(book => book.categories || []).filter(Boolean);
        const categories = [...new Set(allCategories)];
        
        // Extract unique languages
        const languages = [...new Set(books.map(book => book.language))].filter(Boolean);
        
        res.json({
            types,
            years: years.sort((a, b) => b - a), // Newest first
            ratings: userRatings.sort((a, b) => b - a), // Highest first
            authors: authors.sort(),
            categories: categories.sort(),
            languages
        });
    } catch (error) {
        console.error('Помилка отримання параметрів фільтрації книг:', error);
        res.status(500).json({ error: 'Не вдалося отримати параметри фільтрації книг' });
    }
});

// Update Reading Status
app.put('/api/books/status/:userId/:bookId', async (req, res) => {
    try {
        const { userId, bookId } = req.params;
        const { readingStatus, currentPage, notes } = req.body;
        
        // Validate reading status
        const validStatuses = ['reading', 'to-read', 'finished'];
        if (!validStatuses.includes(readingStatus)) {
            return res.status(400).json({ 
                error: 'Неправильний статус читання',
                details: `Отримано: ${readingStatus}. Допустимі значення: ${validStatuses.join(', ')}`
            });
        }
        
        // Check if user has this book in their collection
        const existingRating = await db.collection('book_ratings').findOne({ userId, bookId });
        
        if (!existingRating) {
            return res.status(404).json({ error: 'Книгу не знайдено в колекції користувача' });
        }
        
        // Update fields
        const updateData = {
            readingStatus,
            timestamp: new Date() // Update timestamp when status changes
        };
        
        // Add optional fields if provided
        if (currentPage !== undefined) updateData.currentPage = currentPage;
        if (notes !== undefined) updateData.notes = notes;
        
        // Update the document
        await db.collection('book_ratings').updateOne(
            { userId, bookId },
            { $set: updateData }
        );
        
        res.json({ 
            success: true, 
            message: 'Статус читання успішно оновлено',
            readingStatus,
            currentPage,
            notes
        });
    } catch (error) {
        console.error('Помилка оновлення статусу читання:', error);
        res.status(500).json({ error: 'Не вдалося оновити статус читання' });
    }
});

// Get Book Statistics for User Dashboard
app.get('/api/books/stats/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get all book ratings for this user
        const ratings = await db.collection('book_ratings')
            .find({ userId })
            .toArray();
            
        if (ratings.length === 0) {
            return res.json({
                totalBooks: 0,
                booksRead: 0,
                booksReading: 0,
                booksToRead: 0,
                totalPages: 0,
                averageRating: 0,
                favoriteCategories: [],
                favoriteAuthors: []
            });
        }
        
        // Get bookIds from all ratings
        const bookIds = ratings.map(rating => rating.bookId);
        
        // Get information about all rated books
        const books = await db.collection('books')
            .find({ bookId: { $in: bookIds } })
            .toArray();
        
        // Create a map for quick book lookups
        const booksMap = {};
        books.forEach(book => {
            booksMap[book.bookId] = book;
        });
        
        // Calculate statistics
        const totalBooks = ratings.length;
        
        const booksRead = ratings.filter(rating => rating.readingStatus === 'finished').length;
        const booksReading = ratings.filter(rating => rating.readingStatus === 'reading').length;
        const booksToRead = ratings.filter(rating => rating.readingStatus === 'to-read').length;
        
        let totalPages = 0;
        ratings.forEach(rating => {
            const book = booksMap[rating.bookId];
            if (book && book.pageCount) {
                totalPages += book.pageCount;
            }
        });
        
        // Calculate average rating (excluding null/undefined ratings)
        const ratedBooks = ratings.filter(rating => rating.rating !== null && rating.rating !== undefined);
        const averageRating = ratedBooks.length > 0 
            ? ratedBooks.reduce((sum, item) => sum + item.rating, 0) / ratedBooks.length 
            : 0;
        
        // Count categories and authors
        const categoryCount = {};
        const authorCount = {};
        
        ratings.forEach(rating => {
            const book = booksMap[rating.bookId];
            if (book) {
                // Count categories
                if (book.categories) {
                    book.categories.forEach(category => {
                        categoryCount[category] = (categoryCount[category] || 0) + 1;
                    });
                }
                
                // Count authors
                if (book.authors) {
                    book.authors.forEach(author => {
                        authorCount[author] = (authorCount[author] || 0) + 1;
                    });
                }
            }
        });
        
        // Get top categories and authors
        const favoriteCategories = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([category, count]) => ({ category, count }));
            
        const favoriteAuthors = Object.entries(authorCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([author, count]) => ({ author, count }));
        
        res.json({
            totalBooks,
            booksRead,
            booksReading,
            booksToRead,
            totalPages,
            averageRating: averageRating.toFixed(1),
            favoriteCategories,
            favoriteAuthors
        });
    } catch (error) {
        console.error('Помилка отримання статистики книг:', error);
        res.status(500).json({ error: 'Не вдалося отримати статистику книг' });
    }
});

// Start server
(async () => {
    await connectToDatabase();
    
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})();