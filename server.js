const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_app';
let db;

// API Keys
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const EXCHANGERATE_API_KEY = process.env.EXCHANGERATE_API_KEY;

// Connect to MongoDB
async function connectToDatabase() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db();
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

// Ratings API routes
app.get('http://localhost:10000/api/rate/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        const response = await axios.get(`http://www.omdbapi.com/?s=${query}&apikey=${OMDB_API_KEY}`);
        
        if (response.data.Response === 'False') {
            return res.status(404).json({ error: response.data.Error || 'No results found' });
        }
        
        // Transform the data to match our frontend format
        const results = response.data.Search.map(item => ({
            id: item.imdbID,
            title: item.Title,
            poster_path: item.Poster !== 'N/A' ? item.Poster : null,
            release_date: item.Year,
            media_type: item.Type,
            vote_average: null // OMDB search doesn't include ratings
        }));
        
        res.json({ results });
    } catch (error) {
        console.error('OMDB search error:', error);
        res.status(500).json({ error: 'Failed to fetch search results' });
    }
});

app.get('http://localhost:10000/api/rate/collection/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
        const sortField = req.query.sortField || 'timestamp';
        
        // Get all ratings for this user from the database
        const ratings = await db.collection('ratings')
            .find({ userId })
            .sort({ [sortField]: sortOrder })
            .toArray();
            
        // For each rating, we need the complete media information
        const results = await Promise.all(ratings.map(async (rating) => {
            // First check if we have the media info cached in our media collection
            let mediaInfo = await db.collection('media').findOne({ imdbId: rating.imdbId });
            
            // If not found in our cache, fetch from OMDB
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
                        
                        // Cache the media info
                        await db.collection('media').insertOne(mediaInfo);
                    }
                } catch (error) {
                    console.error(`Error fetching media ${rating.imdbId}:`, error);
                }
            }
            
            return {
                id: rating.imdbId,
                title: mediaInfo?.title || 'Unknown Title',
                poster_path: mediaInfo?.poster || null,
                release_date: mediaInfo?.year || 'Unknown Year',
                media_type: mediaInfo?.type || 'unknown',
                vote_average: rating.rating,
                userRating: rating.rating,
                timestamp: rating.timestamp,
                // Include additional details for detail view
                details: {
                    plot: mediaInfo?.plot || 'No plot available',
                    director: mediaInfo?.director || 'Unknown',
                    actors: mediaInfo?.actors || 'Unknown',
                    genre: mediaInfo?.genre || 'Unknown',
                    imdbRating: mediaInfo?.imdbRating || 'N/A'
                }
            };
        }));
        
        res.json({ results });
    } catch (error) {
        console.error('Error fetching user collection:', error);
        res.status(500).json({ error: 'Failed to fetch user collection' });
    }
});

app.get('http://localhost:10000/api/rate/add/:userId_:imdbId_:rating', async (req, res) => {
    try {
        const { userId, imdbId, rating } = req.params;
        const ratingValue = parseFloat(rating);
        
        if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 10) {
            return res.status(400).json({ error: 'Invalid rating. Must be a number between 0 and 10.' });
        }
        
        // Fetch media info from OMDB
        const omdbResponse = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
        
        if (omdbResponse.data.Response === 'False') {
            return res.status(404).json({ error: 'Media not found' });
        }
        
        // Store media info in our cache
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
        
        // Check if we already have this media in our cache
        const existingMedia = await db.collection('media').findOne({ imdbId });
        
        if (!existingMedia) {
            await db.collection('media').insertOne(mediaInfo);
        }
        
        // Check if user already rated this media
        const existingRating = await db.collection('ratings').findOne({ userId, imdbId });
        
        if (existingRating) {
            // Update existing rating
            await db.collection('ratings').updateOne(
                { userId, imdbId },
                { $set: { rating: ratingValue, timestamp: new Date() } }
            );
        } else {
            // Add new rating
            await db.collection('ratings').insertOne({
                userId,
                imdbId,
                rating: ratingValue,
                timestamp: new Date()
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Rating added successfully',
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
        console.error('Error adding rating:', error);
        res.status(500).json({ error: 'Failed to add rating' });
    }
});

app.delete('http://localhost:10000/api/rate/remove/:userId/:imdbId', async (req, res) => {
    try {
        const { userId, imdbId } = req.params;
        
        // Remove the rating
        const result = await db.collection('ratings').deleteOne({ userId, imdbId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Rating not found' });
        }
        
        res.json({ success: true, message: 'Rating removed successfully' });
    } catch (error) {
        console.error('Error removing rating:', error);
        res.status(500).json({ error: 'Failed to remove rating' });
    }
});

// Weather API route
app.get('http://localhost:10000/api/weather/:cityname', async (req, res) => {
    try {
        const cityName = req.params.cityname;
        
        // Fetch current weather data
        const weatherResponse = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${cityName},ua&units=metric&appid=${OPENWEATHER_API_KEY}`
        );
        
        // Fetch forecast data
        const forecastResponse = await axios.get(
            `https://api.openweathermap.org/data/2.5/forecast?q=${cityName},ua&units=metric&appid=${OPENWEATHER_API_KEY}`
        );
        
        // Get days of week in Ukrainian
        const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        
        // Process current weather
        const current = weatherResponse.data;
        
        // Process 5-day forecast (one entry per day)
        const forecast = [];
        const processedDays = new Set();
        
        forecastResponse.data.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const dayOfWeek = days[date.getDay()];
            
            // Only take the first forecast for each day (excluding current day)
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
        
        // Format and send the response
        const weatherData = {
            location: current.name,
            country: current.sys.country,
            temperature: Math.round(current.main.temp),
            condition: current.weather[0].main.toLowerCase(),
            description: current.weather[0].description,
            humidity: current.main.humidity,
            windSpeed: Math.round(current.wind.speed * 3.6), // Convert m/s to km/h
            pressure: current.main.pressure,
            feelsLike: Math.round(current.main.feels_like),
            forecast: forecast
        };
        
        res.json(weatherData);
    } catch (error) {
        console.error('Weather API error:', error);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

// Currency API routes
app.get('http://localhost:10000/api/currency/available', async (req, res) => {
    try {
        // Fetch exchange rates from API
        const response = await axios.get(
            `https://v6.exchangerate-api.com/v6/${EXCHANGERATE_API_KEY}/latest/UAH`
        );
        
        if (!response.data || !response.data.conversion_rates) {
            return res.status(500).json({ error: 'Invalid response from exchange rate API' });
        }
        
        const rates = response.data.conversion_rates;
        const result = {};
        
        // Get the most common currencies
        const currencies = ['UAH', 'USD', 'EUR', 'GBP', 'PLN', 'JPY', 'CHF', 'CAD', 'AUD'];
        
        currencies.forEach(currency => {
            // For UAH, the rate is 1
            if (currency === 'UAH') {
                result[currency] = { rate: 1, change: 0 };
                return;
            }
            
            // Convert to UAH rate (inverse of the API response)
            if (rates[currency]) {
                // The API gives us X UAH = 1 [currency], but we want 1 UAH = X [currency]
                const rate = 1 / rates[currency];
                
                // We don't have real change data, so generate mock change data for demo
                const change = (Math.random() * 0.4 - 0.2); // Random change between -0.2 and 0.2
                
                result[currency] = { rate, change };
            }
        });
        
        res.json(result);
    } catch (error) {
        console.error('Currency API error:', error);
        res.status(500).json({ error: 'Failed to fetch currency data' });
    }
});

// Tracker API routes
app.get('http://localhost:10000/api/tracker/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Get all tracked items for this user
        const trackedItems = await db.collection('tracker').find({ userId }).toArray();
        
        res.json(trackedItems);
    } catch (error) {
        console.error('Error fetching tracked items:', error);
        res.status(500).json({ error: 'Failed to fetch tracked items' });
    }
});

app.get('http://localhost:10000/api/tracker/add/:url', async (req, res) => {
    try {
        const url = req.params.url;
        const userId = req.query.userid;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        // Determine platform from URL
        let platform = null;
        if (url.includes('store.steampowered.com') || url.includes('steamcommunity.com')) {
            platform = 'steam';
        } else if (url.includes('rozetka.com.ua')) {
            platform = 'rozetka';
        } else {
            return res.status(400).json({ error: 'Unsupported platform. Only Steam and Rozetka are supported.' });
        }
        
        // For a real application, we would scrape the product info from the URL
        // For this demo, we'll create mock data
        
        let productInfo;
        const id = String(url.split('').reduce((a, b) => a + b.charCodeAt(0), 0));
        
        if (platform === 'steam') {
            const gameNames = [
                'Half-Life: Alyx', 'Counter-Strike 2', 'DOTA 2', 'Portal 2', 
                'Cyberpunk 2077', 'Baldur\'s Gate 3', 'The Witcher 3', 'Hollow Knight'
            ];
            productInfo = {
                id,
                url,
                platform,
                title: gameNames[parseInt(id) % gameNames.length],
                price: 10 + (parseInt(id) % 50),
                currency: 'USD',
                priceChange: Math.round((Math.random() * 10 - 5) * 100) / 100,
                dateAdded: new Date()
            };
        } else {
            const productNames = [
                'Ноутбук Apple MacBook Air', 'Смартфон Samsung Galaxy S21', 
                'Навушники Sony WH-1000XM4', 'Монітор LG UltraGear', 
                'Клавіатура Logitech G Pro X', 'Планшет iPad Pro'
            ];
            productInfo = {
                id,
                url,
                platform,
                title: productNames[parseInt(id) % productNames.length],
                price: 1000 + (parseInt(id) % 20000),
                currency: 'UAH',
                priceChange: Math.round((Math.random() * 1000 - 500) * 100) / 100,
                dateAdded: new Date()
            };
        }
        
        // Check if user already tracks this item
        const existingItem = await db.collection('tracker').findOne({ userId, url });
        
        if (existingItem) {
            return res.status(400).json({ error: 'This item is already being tracked' });
        }
        
        // Add userId to product info
        productInfo.userId = userId;
        
        // Save to database
        await db.collection('tracker').insertOne(productInfo);
        
        res.json({ success: true, item: productInfo });
    } catch (error) {
        console.error('Error adding tracked item:', error);
        res.status(500).json({ error: 'Failed to add tracked item' });
    }
});

app.delete('http://localhost:10000/api/tracker/remove/:userId/:itemId', async (req, res) => {
    try {
        const { userId, itemId } = req.params;
        
        // Remove the tracked item
        const result = await db.collection('tracker').deleteOne({ userId, id: itemId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Tracked item not found' });
        }
        
        res.json({ success: true, message: 'Tracked item removed successfully' });
    } catch (error) {
        console.error('Error removing tracked item:', error);
        res.status(500).json({ error: 'Failed to remove tracked item' });
    }
});

// Start server
(async () => {
    await connectToDatabase();
    
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})();