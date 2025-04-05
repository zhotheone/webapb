// server.js
/**
 * Media Tracker API Server
 * 
 * This API supports a Telegram Web App for tracking media ratings and products.
 * 
 * API Endpoints:
 * 
 * Ratings:
 * - GET /api/ratings/user/{userId} - Get user ratings with optional sorting and filtering
 *   Query params:
 *   - minRating: filter by minimum rating (1-10)
 *   - mediaType: filter by media type (movie, series, episode, game, other)
 *   - sort: rating_desc (default), rating_asc, title_asc, title_desc, year_desc, year_asc
 * 
 * - GET /api/ratings/search/{query} - Search OMDB for media
 * 
 * - POST /api/ratings/add/{userId}_{imdbId}_{rating} - Add or update a rating
 * 
 * - GET /api/ratings/filter - Advanced filtering (multiple parameters)
 *   Query params:
 *   - userId: (required) User ID
 *   - minRating: minimum rating (1-10)
 *   - maxRating: maximum rating (1-10)
 *   - mediaType: filter by media type (movie, series, episode, game, other)
 *   - genre: filter by genre (partial match)
 *   - year: filter by year (exact or range with hyphen e.g. "1990-2000")
 *   - director: filter by director (partial match)
 *   - query: search in title and plot (partial match)
 *   - sort: rating_desc (default), rating_asc, title_asc, title_desc, year_desc, year_asc, recent
 * 
 * Products:
 * - GET /api/tracker/user/{userId} - Get user tracked products
 * 
 * - POST /api/tracker/add - Add new tracked product
 *   Body: { userId, productId, productName, category?, price?, url? }
 * 
 * Weather:
 * - GET /api/weather/current - Get current weather
 *   Query params: 
 *   - city: city name (required if lat/lon not provided)
 *   - lat: latitude (required if city not provided)
 *   - lon: longitude (required if city not provided)
 *   - units: metric (default), imperial
 * 
 * Currency:
 * - GET /api/currency/convert - Convert currency
 *   Query params:
 *   - from: source currency code
 *   - to: target currency code
 *   - amount: amount to convert (default: 1)
 * - GET /api/currency/list - Get list of supported currencies
 */

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// IMPORTANT: Apply CORS first before any other middleware
// Enhanced CORS configuration - moved higher to ensure it processes before other middleware
app.use(cors({
  origin: '*', // Allow requests from any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Other middleware
app.use(express.json());

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

// MongoDB Atlas Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define Schemas
const RatingSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    imdbId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 10 },
    title: { type: String, required: true },
    year: String,
    poster: String,
    plot: String,
    genre: String,
    director: String,
    mediaType: { 
      type: String, 
      enum: ['movie', 'series', 'episode', 'game', 'other'],
      default: 'movie'
    },
    imdbRating: String,
    imdbVotes: String,
    createdAt: { type: Date, default: Date.now }
});

const TrackerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  url: String,
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  category: String,
  price: Number,
  salePrice: Number,
  salePercent: Number,
  status: { type: String, default: 'fullprice' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: {type: Date, default: Date.now}
});

// Define Models
const Rating = mongoose.model('Rating', RatingSchema);
const Tracker = mongoose.model('Tracker', TrackerSchema);

// API Routes
// Logging middleware for debugging
app.use('/api', (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length) {
    console.log('Body:', req.body);
  }
  next();
});

// Debug route to test API connectivity
app.get('/api/debug', (req, res) => {
  // Set proper content type
  res.setHeader('Content-Type', 'application/json');
  
  // Return a simple JSON response
  res.status(200).json({ 
    status: 'success', 
    message: 'API is working correctly',
    headers: req.headers,
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

// 1. Fetch all ratings for a user with no pagination
app.get('/api/ratings/user/:userId', async (req, res) => {
  try {
    console.log(`Fetching all ratings for user: ${req.params.userId}`);
    
    let query = { userId: req.params.userId };
    
    // Apply rating filter if provided
    if (req.query.minRating) {
      query.rating = { $gte: parseInt(req.query.minRating) };
    }
    
    // Apply media type filter if provided
    if (req.query.mediaType && req.query.mediaType !== 'all') {
      query.mediaType = req.query.mediaType;
    }
    
    // Create the base query
    let dbQuery = Rating.find(query);
    
    // Apply sorting if provided
    if (req.query.sort) {
      const sortMap = {
        'rating_desc': { rating: -1 },
        'rating_asc': { rating: 1 },
        'title_asc': { title: 1 },
        'title_desc': { title: -1 },
        'year_desc': { year: -1 },
        'year_asc': { year: 1 }
      };
      
      // Default to rating_desc if sort parameter is invalid
      const sortOrder = sortMap[req.query.sort] || { rating: -1 };
      dbQuery = dbQuery.sort(sortOrder);
    } else {
      // Default sort: rating high to low
      dbQuery = dbQuery.sort({ rating: -1 });
    }
    
    // Explicitly set no limit to ensure all documents are returned
    // This will override any default limit in Mongoose
    dbQuery = dbQuery.limit(0);
    
    // Count total ratings before executing the query
    const totalCount = await Rating.countDocuments(query);
    console.log(`Total ratings matching query: ${totalCount}`);
    
    // Execute query
    const ratings = await dbQuery.exec();
    console.log(`Retrieved ${ratings.length} ratings for user ${req.params.userId}`);
    
    // Fix any missing mediaType values - as in previous code
    const fixedRatings = ratings.map(rating => {
      const item = rating.toObject();
      
      // Check media type and correct it if needed
      if (item.imdbId) {
        // Special cases for known games or anime by ID pattern
        if (item.imdbId.startsWith('tt0') && 
            (item.title.toLowerCase().includes('game') || 
             item.title.toLowerCase().includes('dota') || 
             item.title.toLowerCase().includes('league of legends'))) {
          item.mediaType = 'game';
        } 
        // Handle anime detection if needed
        else if (item.title.toLowerCase().includes('anime') || 
                 item.genre?.toLowerCase().includes('anime')) {
          item.mediaType = 'anime';
        }
      }
      
      return item;
    });
    
    // Log debugging info
    console.log(`Returning ${fixedRatings.length} ratings with media types`);
    
    res.json(fixedRatings);
  } catch (error) {
    console.error('Error fetching user ratings:', error);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// 2. Search OMDB and return results
app.get('/api/ratings/search/:query', async (req, res) => {
  try {
    console.log(`Searching OMDB for: ${req.params.query}`);
    const response = await axios.get(`http://www.omdbapi.com/?s=${encodeURIComponent(req.params.query)}&apikey=${process.env.OMDB_API_KEY}`);
    
    console.log('OMDB API response:', response.data);
    
    if (response.data.Response === 'False') {
      console.log('OMDB returned no results:', response.data.Error);
      return res.status(404).json({ error: response.data.Error });
    }
    
    res.json(response.data.Search);
  } catch (error) {
    console.error('Error searching OMDB:', error);
    res.status(500).json({ error: 'Failed to search OMDB' });
  }
});

// 3. Add a rating with detailed metadata using JSON body
app.post('/api/ratings/add-rating', async (req, res) => {
  try {
    console.log('Rating submission body:', req.body);
    
    // Extract from request body
    const { userId, imdbId, rating } = req.body;
    
    console.log(`Adding rating: userId=${userId}, imdbId=${imdbId}, rating=${rating}`);
    
    // Input validation
    if (!userId || !imdbId || !rating) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        received: req.body
      });
    }
    
    // Validate rating is a number between 1-10
    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 10) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 10' });
    }
    
    // Get detailed movie info from OMDB
    try {
      console.log(`Fetching movie data from OMDB for ${imdbId}`);
      const response = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`);
      
      if (response.data.Response === 'False') {
        console.error('OMDB error:', response.data.Error);
        return res.status(404).json({ error: response.data.Error });
      }
      
      const movieData = response.data;
      console.log('OMDB data received:', movieData.Title, 'Type:', movieData.Type);
      
      // Map OMDB Type to our mediaType enum
      let mediaType = 'other';
      if (movieData.Type === 'movie') mediaType = 'movie';
      else if (movieData.Type === 'series') mediaType = 'series';
      else if (movieData.Type === 'episode') mediaType = 'episode';
      else if (movieData.Type === 'game') mediaType = 'game';
      
      // Check if rating already exists
      console.log('Checking for existing rating');
      const existingRating = await Rating.findOne({ userId, imdbId });
      
      if (existingRating) {
        // Update existing rating
        console.log('Updating existing rating');
        existingRating.rating = ratingNum;
        // Preserve original media type if available
        if (!existingRating.mediaType) {
          existingRating.mediaType = mediaType;
        }
        // Add IMDb ratings if available
        if (movieData.imdbRating) {
          existingRating.imdbRating = movieData.imdbRating;
        }
        if (movieData.imdbVotes) {
          existingRating.imdbVotes = movieData.imdbVotes;
        }
        await existingRating.save();
        return res.json(existingRating);
      } else {
        // Create new rating
        console.log('Creating new rating with media type:', mediaType);
        const newRating = new Rating({
          userId,
          imdbId,
          rating: ratingNum,
          title: movieData.Title,
          year: movieData.Year,
          poster: movieData.Poster,
          plot: movieData.Plot,
          genre: movieData.Genre,
          director: movieData.Director,
          mediaType,
          imdbRating: movieData.imdbRating || null,
          imdbVotes: movieData.imdbVotes || null
        });
        
        await newRating.save();
        return res.status(201).json(newRating);
      }
    } catch (omdbError) {
      console.error('OMDB API Error:', omdbError);
      
      // Fallback: Create a basic rating if OMDB fails
      console.log('Using fallback to create basic rating');
      const existingRating = await Rating.findOne({ userId, imdbId });
      
      if (existingRating) {
        // Update existing rating even without OMDB
        existingRating.rating = ratingNum;
        await existingRating.save();
        return res.json(existingRating);
      } else {
        // Create minimal new rating
        const newRating = new Rating({
          userId,
          imdbId,
          rating: ratingNum,
          title: imdbId, // Use imdbId as a fallback title
          mediaType: 'movie' // Default to movie
        });
        
        await newRating.save();
        return res.status(201).json(newRating);
      }
    }
  } catch (error) {
    console.error('Error adding rating:', error);
    res.status(500).json({ 
      error: 'Failed to add rating',
      details: error.message
    });
  }
});

// 4. Fetch all tracked products for a user
app.get('/api/tracker/user/:userId', async (req, res) => {
  try {
    const trackedProducts = await Tracker.find({ userId: req.params.userId });
    res.json(trackedProducts);
  } catch (error) {
    console.error('Error fetching tracked products:', error);
    res.status(500).json({ error: 'Failed to fetch tracked products' });
  }
});

// 5. Advanced filtering and search for ratings
app.get('/api/ratings/filter', async (req, res) => {
  try {
    const { userId, minRating, maxRating, genre, year, director, query, sort, mediaType } = req.query;
    
    // Build the filter query
    let filterQuery = {};
    
    // User ID is required
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    filterQuery.userId = userId;
    
    // Rating range
    if (minRating || maxRating) {
      filterQuery.rating = {};
      if (minRating) filterQuery.rating.$gte = parseInt(minRating);
      if (maxRating) filterQuery.rating.$lte = parseInt(maxRating);
    }
    
    // Media type filter
    if (mediaType && mediaType !== 'all') {
      filterQuery.mediaType = mediaType;
    }
    
    // Genre (partial match)
    if (genre) {
      filterQuery.genre = { $regex: genre, $options: 'i' };
    }
    
    // Year (exact match or range)
    if (year) {
      if (year.includes('-')) {
        // Year range (e.g., 1990-2000)
        const [startYear, endYear] = year.split('-');
        filterQuery.year = { $gte: startYear, $lte: endYear };
      } else {
        // Exact year
        filterQuery.year = year;
      }
    }
    
    // Director (partial match)
    if (director) {
      filterQuery.director = { $regex: director, $options: 'i' };
    }
    
    // Text search (title or plot)
    if (query) {
      filterQuery.$or = [
        { title: { $regex: query, $options: 'i' } },
        { plot: { $regex: query, $options: 'i' } }
      ];
    }
    
    // Create the base query
    let dbQuery = Rating.find(filterQuery);
    
    // Apply sorting
    const sortMap = {
      'rating_desc': { rating: -1 },
      'rating_asc': { rating: 1 },
      'title_asc': { title: 1 },
      'title_desc': { title: -1 },
      'year_desc': { year: -1 },
      'year_asc': { year: 1 },
      'recent': { createdAt: -1 } // Most recently added
    };
    
    // Default to rating_desc if sort parameter is invalid
    const sortOrder = sort && sortMap[sort] ? sortMap[sort] : { rating: -1 };
    dbQuery = dbQuery.sort(sortOrder);
    
    const ratings = await dbQuery.exec();
    res.json(ratings);
  } catch (error) {
    console.error('Error filtering ratings:', error);
    res.status(500).json({ error: 'Failed to filter ratings' });
  }
});

// Add a tracked product with URL parsing
app.post('/api/tracker/add', async (req, res) => {
  try {
    const { userId, url } = req.body;
    
    if (!userId || !url) {
      return res.status(400).json({ error: 'User ID and URL are required' });
    }
    
    console.log(`Adding product for user ${userId} with URL: ${url}`);
    
    // Parse the URL to get product details
    try {
      const productDetails = await parseProductUrl(url);
      
      // Generate a product ID if not provided (based on URL)
      const productId = generateProductId(url);
      
      // Check if product is already on sale - if so, notify but don't add
      if (productDetails.status === 'sale') {
        console.log('Product is already on sale, notifying user');
        return res.status(200).json({ 
          alreadyOnSale: true, 
          message: 'Product is already on sale!',
          saleDetails: {
            originalPrice: productDetails.price,
            salePrice: productDetails.salePrice,
            salePercent: productDetails.salePercent,
            productName: productDetails.productName
          }
        });
      }
      
      // Check if product is already tracked
      const existingProduct = await Tracker.findOne({ userId, productId });
      
      if (existingProduct) {
        // Update existing product
        console.log('Updating existing product:', existingProduct.productName);
        
        existingProduct.url = url;
        existingProduct.productName = productDetails.productName;
        existingProduct.category = productDetails.category;
        existingProduct.price = productDetails.price;
        existingProduct.salePrice = productDetails.salePrice;
        existingProduct.salePercent = productDetails.salePercent;
        existingProduct.status = productDetails.status;
        existingProduct.updatedAt = new Date();
        
        await existingProduct.save();
        return res.json(existingProduct);
      } else {
        // Create new tracked product
        console.log('Creating new product:', productDetails.productName);
        
        const newProduct = new Tracker({
          userId,
          productId,
          url,
          productName: productDetails.productName,
          category: productDetails.category,
          price: productDetails.price,
          salePrice: productDetails.salePrice,
          salePercent: productDetails.salePercent,
          status: productDetails.status,
          updatedAt: new Date()
        });
        
        await newProduct.save();
        return res.status(201).json(newProduct);
      }
    } catch (parseError) {
      console.error('Error parsing product URL:', parseError);
      return res.status(400).json({ 
        error: 'Failed to parse product URL', 
        details: parseError.message 
      });
    }
  } catch (error) {
    console.error('Error adding tracked product:', error);
    res.status(500).json({ error: 'Failed to add tracked product' });
  }
});

/**
 * Parse product URL to extract details
 * @param {string} url - The product URL
 * @returns {object} - Product details
 */
async function parseProductUrl(url) {
  // Determine which website the URL is from
  if (url.includes('store.steampowered.com')) {
    return await parseSteamUrl(url);
  } else if (url.includes('comfy.ua')) {
    return await parseComfyUrl(url);
  } else if (url.includes('rozetka.com.ua')) {
    return await parseRozetkaUrl(url);
  } else {
    throw new Error('Unsupported website. Currently supporting Steam, Comfy and Rozetka only.');
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

// Add Currency conversion endpoint using ExchangeRate-API
app.get('/api/currency/convert', async (req, res) => {
  try {
    const { from, to, amount } = req.query;
    
    // Validate parameters
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing required parameters: from and to currencies' });
    }
    
    const amountToConvert = parseFloat(amount) || 1;
    
    console.log(`Currency conversion request: ${amountToConvert} ${from} to ${to}`);
    
    // Get API key from environment variables
    const CURRENCY_API_KEY = process.env.EXCHANGERATE_API_KEY;
    
    if (!CURRENCY_API_KEY) {
      return res.status(500).json({ 
        error: 'Currency API key not configured',
        message: 'Please set the EXCHANGERATE_API_KEY environment variable' 
      });
    }
    
    // Call Exchange Rate API
    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${CURRENCY_API_KEY}/pair/${from}/${to}/${amountToConvert}`
    );
    
    if (response.data.result !== 'success') {
      throw new Error(response.data.error || 'API request failed');
    }
    
    // Format the response
    const result = {
      from: response.data.base_code,
      to: response.data.target_code,
      amount: response.data.conversion_result,
      rate: response.data.conversion_rate,
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Currency API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to convert currency',
      details: error.response?.data?.message || error.message
    });
  }
});

// Add supported currencies list endpoint
app.get('/api/currency/list', async (req, res) => {
  try {
    console.log('Currency list request');
    
    // Get API key from environment variables
    const CURRENCY_API_KEY = process.env.EXCHANGERATE_API_KEY;
    
    if (!CURRENCY_API_KEY) {
      return res.status(500).json({ error: 'Currency API key not configured' });
    }
    
    // Call Exchange Rate API for supported currencies
    const response = await axios.get(
      `https://v6.exchangerate-api.com/v6/${CURRENCY_API_KEY}/codes`
    );
    
    if (response.data.result !== 'success') {
      throw new Error(response.data.error || 'API request failed');
    }
    
    // Format the response
    const currencies = response.data.supported_codes.map(code => ({
      code: code[0],
      name: code[1]
    }));
    
    res.json({
      success: true,
      data: currencies
    });
    
  } catch (error) {
    console.error('Currency list error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch currency list',
      details: error.response?.data?.message || error.message
    });
  }
});

// Add Weather API endpoints using OpenWeatherMap
app.get('/api/weather/current', async (req, res) => {
  try {
    const { city, lat, lon, units = 'metric' } = req.query;
    
    // Check for required parameters
    if (!city && (!lat || !lon)) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        message: 'Please provide either city name or latitude/longitude coordinates'
      });
    }
    
    // Get API key from environment variables
    const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    
    if (!WEATHER_API_KEY) {
      return res.status(500).json({ 
        error: 'Weather API key not configured',
        message: 'Please set the OPENWEATHER_API_KEY environment variable' 
      });
    }
    
    // Build the API URL based on provided parameters
    let apiUrl;
    if (city) {
      console.log(`Weather request for city: ${city}`);
      apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${WEATHER_API_KEY}`;
    } else {
      console.log(`Weather request for coordinates: lat=${lat}, lon=${lon}`);
      apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${WEATHER_API_KEY}`;
    }
    
    // Call OpenWeatherMap API
    const response = await axios.get(apiUrl);
    
    // Format the response
    const weatherData = {
      location: {
        name: response.data.name,
        country: response.data.sys.country,
        coordinates: {
          lat: response.data.coord.lat,
          lon: response.data.coord.lon
        }
      },
      weather: {
        condition: response.data.weather[0].main,
        description: response.data.weather[0].description,
        icon: `https://openweathermap.org/img/wn/${response.data.weather[0].icon}@2x.png`
      },
      temperature: {
        current: response.data.main.temp,
        feelsLike: response.data.main.feels_like,
        min: response.data.main.temp_min,
        max: response.data.main.temp_max,
        units: units === 'imperial' ? '°F' : '°C'
      },
      wind: {
        speed: response.data.wind.speed,
        direction: response.data.wind.deg,
        units: units === 'imperial' ? 'mph' : 'm/s'
      },
      humidity: response.data.main.humidity,
      pressure: response.data.main.pressure,
      visibility: response.data.visibility,
      timestamp: new Date(response.data.dt * 1000).toISOString(),
      sunrise: new Date(response.data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(response.data.sys.sunset * 1000).toISOString()
    };
    
    res.json({
      success: true,
      data: weatherData
    });
    
  } catch (error) {
    console.error('Weather API error:', error.response?.data || error.message);
    
    // Handle common API errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 404) {
        return res.status(404).json({ 
          error: 'Location not found',
          message: 'The specified city or coordinates could not be found'
        });
      }
      
      if (status === 401) {
        return res.status(500).json({ 
          error: 'Invalid API key',
          message: 'Please check your OpenWeatherMap API key'
        });
      }
    }
    
    // General error handling
    res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: error.response?.data?.message || error.message
    });
  }
});

// Add 5-day weather forecast endpoint
app.get('/api/weather/forecast', async (req, res) => {
  try {
    const { city, lat, lon, units = 'metric', days = 5 } = req.query;
    
    // Check for required parameters
    if (!city && (!lat || !lon)) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Please provide either city name or latitude/longitude coordinates'
      });
    }
    
    // Get API key from environment variables
    const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    
    if (!WEATHER_API_KEY) {
      return res.status(500).json({
        error: 'Weather API key not configured',
        message: 'Please set the OPENWEATHER_API_KEY environment variable'
      });
    }
    
    // Build the API URL based on provided parameters
    let apiUrl;
    if (city) {
      console.log(`Weather forecast request for city: ${city}`);
      apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=${units}&appid=${WEATHER_API_KEY}`;
    } else {
      console.log(`Weather forecast request for coordinates: lat=${lat}, lon=${lon}`);
      apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${WEATHER_API_KEY}`;
    }
    
    // Call OpenWeatherMap API
    const response = await axios.get(apiUrl);
    
    // Process and format the forecast data
    const forecastData = {
      location: {
        name: response.data.city.name,
        country: response.data.city.country,
        coordinates: {
          lat: response.data.city.coord.lat,
          lon: response.data.city.coord.lon
        }
      },
      forecast: processForecastData(response.data.list, parseInt(days), units),
      units: units === 'imperial' ? { temp: '°F', wind: 'mph' } : { temp: '°C', wind: 'm/s' }
    };
    
    res.json({
      success: true,
      data: forecastData
    });
    
  } catch (error) {
    console.error('Weather forecast API error:', error.response?.data || error.message);
    
    // Handle common API errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 404) {
        return res.status(404).json({
          error: 'Location not found',
          message: 'The specified city or coordinates could not be found'
        });
      }
      
      if (status === 401) {
        return res.status(500).json({
          error: 'Invalid API key',
          message: 'Please check your OpenWeatherMap API key'
        });
      }
    }
    
    // General error handling
    res.status(500).json({
      error: 'Failed to fetch weather forecast',
      details: error.response?.data?.message || error.message
    });
  }
});

// Helper function to process forecast data
function processForecastData(forecastList, days, units) {
  // Group forecast by day
  const dailyForecasts = {};
  
  forecastList.forEach(item => {
    const date = new Date(item.dt * 1000);
    const day = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    if (!dailyForecasts[day]) {
      dailyForecasts[day] = [];
    }
    
    dailyForecasts[day].push({
      time: date.toISOString(),
      weather: {
        condition: item.weather[0].main,
        description: item.weather[0].description,
        icon: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`
      },
      temperature: {
        current: item.main.temp,
        feelsLike: item.main.feels_like,
        min: item.main.temp_min,
        max: item.main.temp_max
      },
      wind: {
        speed: item.wind.speed,
        direction: item.wind.deg
      },
      humidity: item.main.humidity,
      pressure: item.main.pressure
    });
  });
  
  // Convert to array and limit to the requested number of days
  return Object.keys(dailyForecasts)
    .slice(0, days)
    .map(day => ({
      date: day,
      forecasts: dailyForecasts[day]
    }));
}

// Add endpoint to get detailed info for a specific rating
app.get('/api/ratings/:id', async (req, res) => {
  try {
    const rating = await Rating.findById(req.params.id);
    
    if (!rating) {
      return res.status(404).json({ error: 'Rating not found' });
    }
    
    res.json(rating);
  } catch (error) {
    console.error('Error fetching rating details:', error);
    res.status(500).json({ error: 'Failed to fetch rating details' });
  }
});

// Add endpoint to delete a rating
app.delete('/api/ratings/:id', async (req, res) => {
  try {
    const result = await Rating.findByIdAndDelete(req.params.id);
    
    if (!result) {
      return res.status(404).json({ error: 'Rating not found' });
    }
    
    res.json({ success: true, message: 'Rating deleted successfully' });
  } catch (error) {
    console.error('Error deleting rating:', error);
    res.status(500).json({ error: 'Failed to delete rating' });
  }
});

// Add endpoint to get detailed info for a specific product
app.get('/api/tracker/:id', async (req, res) => {
  try {
    const product = await Tracker.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
});

// Add endpoint to delete a product
app.delete('/api/tracker/:id', async (req, res) => {
  try {
    const result = await Tracker.findByIdAndDelete(req.params.id);
    
    if (!result) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server is accessible at http://localhost:${PORT}`);
  console.log(`CORS enabled for all origins in development mode`);
});