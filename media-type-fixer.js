/**
 * Utility script to fix media types in the database
 * 
 * Run with: node media-type-fixer.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));

// Define the Rating schema
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
    enum: ['movie', 'series', 'episode', 'game', 'anime', 'other'],
    default: 'movie'
  },
  imdbRating: String,
  imdbVotes: String,
  createdAt: { type: Date, default: Date.now }
});

const Rating = mongoose.model('Rating', RatingSchema);

// Function to detect media type based on the title and other properties
function detectMediaType(item) {
  const titleLower = item.title.toLowerCase();
  const genreLower = (item.genre || '').toLowerCase();
  const plotLower = (item.plot || '').toLowerCase();
  
  // Game detection
  if (
    item.imdbId?.includes('game') || 
    titleLower.includes('game') ||
    titleLower.includes('dota') ||
    titleLower.includes('league of legends') ||
    titleLower.includes('warcraft') ||
    genreLower.includes('game') ||
    plotLower.includes('video game')
  ) {
    return 'game';
  }
  
  // Anime detection
  if (
    titleLower.includes('anime') ||
    genreLower.includes('anime') ||
    plotLower.includes('anime') ||
    titleLower.includes('manga') ||
    genreLower.includes('manga')
  ) {
    return 'anime';
  }
  
  // Episode detection (already handled by OMDB usually)
  if (item.mediaType === 'episode') {
    return 'episode';
  }
  
  // Series detection (already handled by OMDB usually)
  if (item.mediaType === 'series') {
    return 'series';
  }
  
  // Default to movie
  return item.mediaType || 'movie';
}

async function fixMediaTypes() {
  try {
    console.log('Starting media type fix...');
    
    // Get all ratings
    const ratings = await Rating.find({});
    console.log(`Found ${ratings.length} ratings to check`);
    
    let updates = 0;
    
    // Process each rating
    for (const rating of ratings) {
      const detectedType = detectMediaType(rating);
      
      // If the detected type is different from the current type, update it
      if (rating.mediaType !== detectedType) {
        console.log(`Updating "${rating.title}" from "${rating.mediaType}" to "${detectedType}"`);
        rating.mediaType = detectedType;
        await rating.save();
        updates++;
      }
    }
    
    console.log(`Fixed ${updates} ratings`);
    console.log('Media type fix completed');
    
  } catch (error) {
    console.error('Error fixing media types:', error);
  } finally {
    mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the fix function
fixMediaTypes();
