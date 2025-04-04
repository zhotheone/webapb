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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

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
      default: ''
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
        director: movieData.Director
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
    const { userId, minRating, maxRating, genre, year, director, query, sort } = req.query;
    
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

// Add a tracked product (bonus endpoint)
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});