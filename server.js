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
 */

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto'); // For Telegram auth verification
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Telegram Bot Token for authentication
const BOT_TOKEN = process.env.BOT_TOKEN;

// Telegram WebApp Authentication middleware
const authenticateTelegramWebApp = (req, res, next) => {
  try {
    const initDataStr = req.headers['x-telegram-init-data'];
    
    // Skip authentication if in development mode or if configured to do so
    if (!initDataStr) {
      if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
        console.warn('Warning: Bypassing Telegram authentication, proceeding without validation');
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: Missing Telegram authentication data' });
    }
    
    // If BOT_TOKEN is not configured, skip validation in development
    if (!BOT_TOKEN) {
      if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
        console.warn('Warning: No BOT_TOKEN provided, skipping validation');
        return next();
      }
      return res.status(500).json({ error: 'Server configuration error: Missing BOT_TOKEN' });
    }
    
    // Parse the initData
    const initData = new URLSearchParams(initDataStr);
    
    // Extract the hash for verification
    const hash = initData.get('hash');
    if (!hash) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Telegram data format' });
    }
    
    // Remove the hash from the data to verify
    initData.delete('hash');
    
    // Sort alphabetically as required by Telegram
    const dataCheckArray = Array.from(initData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`);
    
    const dataCheckString = dataCheckArray.join('\n');
    
    // Create the secret key from bot token
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    
    // Calculate the hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Verify the hash
    if (calculatedHash !== hash) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Telegram data signature' });
    }
    
    // Extract user data for convenience
    try {
      const user = JSON.parse(initData.get('user'));
      req.telegramUser = user;
    } catch (e) {
      console.warn('Could not parse user data from Telegram initData');
    }
    
    // Authentication successful
    next();
  } catch (error) {
    // Allow requests to proceed in development mode despite errors
    if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
      console.error('Authentication error in development mode:', error);
      return next();
    }
    
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Unauthorized: Authentication failed' });
  }
};

// Middleware
app.use(express.json());
app.use(cors());

// Apply Telegram authentication middleware to all API routes
app.use('/api', authenticateTelegramWebApp);

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
    // Add media type field
    mediaType: { 
      type: String, 
      enum: ['movie', 'series', 'episode', 'game', 'other'],
      default: 'movie'
    },
    createdAt: { type: Date, default: Date.now }
  });

const TrackerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  category: String,
  price: Number,
  url: String,
  createdAt: { type: Date, default: Date.now }
});

// Define Models
const Rating = mongoose.model('Rating', RatingSchema);
const Tracker = mongoose.model('Tracker', TrackerSchema);

// API Routes
// 1. Fetch all ratings for a user
app.get('/api/ratings/user/:userId', async (req, res) => {
  try {
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
    
    const ratings = await dbQuery.exec();
    res.json(ratings);
  } catch (error) {
    console.error('Error fetching user ratings:', error);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// 2. Search OMDB and return results
app.get('/api/ratings/search/:query', async (req, res) => {
  try {
    const response = await axios.get(`http://www.omdbapi.com/?s=${req.params.query}&apikey=${process.env.OMDB_API_KEY}`);
    
    if (response.data.Response === 'False') {
      return res.status(404).json({ error: response.data.Error });
    }
    
    res.json(response.data.Search);
  } catch (error) {
    console.error('Error searching OMDB:', error);
    res.status(500).json({ error: 'Failed to search OMDB' });
  }
});

// 3. Add a rating with detailed metadata
app.post('/api/ratings/add/:userId_:imdbId_:rating', async (req, res) => {
  try {
    const { userId, imdbId, rating } = req.params;
    
    // Get detailed movie info from OMDB
    const response = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`);
    
    if (response.data.Response === 'False') {
      return res.status(404).json({ error: response.data.Error });
    }
    
    const movieData = response.data;
    
    // Map OMDB Type to our mediaType enum
    let mediaType = 'other';
    if (movieData.Type === 'movie') mediaType = 'movie';
    else if (movieData.Type === 'series') mediaType = 'series';
    else if (movieData.Type === 'episode') mediaType = 'episode';
    else if (movieData.Type === 'game') mediaType = 'game';
    
    // Check if rating already exists
    const existingRating = await Rating.findOne({ userId, imdbId });
    
    if (existingRating) {
      // Update existing rating
      existingRating.rating = parseInt(rating);
      await existingRating.save();
      res.json(existingRating);
    } else {
      // Create new rating
      const newRating = new Rating({
        userId,
        imdbId,
        rating: parseInt(rating),
        title: movieData.Title,
        year: movieData.Year,
        poster: movieData.Poster,
        plot: movieData.Plot,
        genre: movieData.Genre,
        director: movieData.Director,
        mediaType // Add the media type from OMDB
      });
      
      await newRating.save();
      res.status(201).json(newRating);
    }
  } catch (error) {
    console.error('Error adding rating:', error);
    res.status(500).json({ error: 'Failed to add rating' });
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

// Add a tracked product
app.post('/api/tracker/add', async (req, res) => {
  try {
    const { userId, productId, productName, category, price, url } = req.body;
    
    // Check if product is already tracked
    const existingProduct = await Tracker.findOne({ userId, productId });
    
    if (existingProduct) {
      // Update existing product
      existingProduct.productName = productName || existingProduct.productName;
      existingProduct.category = category || existingProduct.category;
      existingProduct.price = price || existingProduct.price;
      existingProduct.url = url || existingProduct.url;
      
      await existingProduct.save();
      res.json(existingProduct);
    } else {
      // Create new tracked product
      const newProduct = new Tracker({
        userId,
        productId,
        productName,
        category,
        price,
        url
      });
      
      await newProduct.save();
      res.status(201).json(newProduct);
    }
  } catch (error) {
    console.error('Error adding tracked product:', error);
    res.status(500).json({ error: 'Failed to add tracked product' });
  }
});

// Route to verify Telegram WebApp authentication - useful for client testing
app.get('/api/auth/verify', (req, res) => {
  res.json({ status: 'success', message: 'Telegram WebApp authentication is valid' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API is protected with Telegram WebApp authentication`);
});