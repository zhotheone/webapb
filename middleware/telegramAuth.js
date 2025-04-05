/**
 * Middleware for Telegram WebApp authentication
 * Verifies that requests come from valid Telegram WebApps
 */

const crypto = require('crypto');

// Get BOT_TOKEN from environment
const BOT_TOKEN = process.env.BOT_TOKEN;

// Validate Telegram WebApp data
function validateTelegramWebAppData(telegramInitData) {
    try {
        // Check if authentication is disabled for development
        if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development') {
            console.log('Warning: Authentication check is disabled in development mode');
            return true;
        }
        
        // Ensure that BOT_TOKEN is available
        if (!BOT_TOKEN) {
            console.error('Error: BOT_TOKEN is not set in environment variables');
            return false;
        }
        
        // Parse the initData string
        const initData = new URLSearchParams(telegramInitData);
        
        // Extract hash and data to check
        const hash = initData.get('hash');
        if (!hash) {
            console.error('Error: No hash found in initData');
            return false;
        }
        
        // Create a check string by removing the hash parameter
        initData.delete('hash');
        const dataCheckString = [...initData.entries()]
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');
        
        // Calculate the secret key using HMAC-SHA256
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        // Calculate the hash of the data check string using the secret key
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        // Compare the calculated hash with the provided hash
        const isValid = calculatedHash === hash;
        
        if (!isValid) {
            console.error('Error: Invalid hash in Telegram WebApp data');
        }
        
        return isValid;
    } catch (error) {
        console.error('Error validating Telegram WebApp data:', error);
        return false;
    }
}

// Middleware for Telegram WebApp authentication
function telegramAuthMiddleware(skipAuth = false) {
    return (req, res, next) => {
        // Skip authentication if specified (for public routes)
        if (skipAuth) {
            return next();
        }
        
        // Skip authentication in development mode if configured
        if (process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV === 'development') {
            console.log('Warning: Authentication check is skipped in development mode');
            
            // Set a consistent development user for testing
            req.telegramUser = {
                id: 594235906,
                username: "dev_user",
                first_name: "Dev",
                last_name: "User"
            };
            
            console.log('Using development fallback user ID:', req.telegramUser.id);
            return next();
        }
        
        // Get the Telegram WebApp initData from headers or body
        const telegramInitData = req.headers['x-telegram-init-data'] || req.body?.initData;
        
        if (!telegramInitData) {
            console.error('Error: Missing Telegram WebApp authentication data');
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'This API requires Telegram WebApp authentication'
            });
        }
        
        // Validate the Telegram WebApp data
        if (!validateTelegramWebAppData(telegramInitData)) {
            console.error('Error: Invalid Telegram WebApp authentication data');
            return res.status(403).json({ 
                error: 'Authentication failed',
                message: 'Invalid Telegram WebApp authentication data'
            });
        }
        
        // Authentication successful, add user info to request
        try {
            // Parse the user data from initData
            const initData = new URLSearchParams(telegramInitData);
            const userDataStr = initData.get('user');
            
            if (userDataStr) {
                req.telegramUser = JSON.parse(decodeURIComponent(userDataStr));
                console.log('Authenticated user:', req.telegramUser.id);
            } else {
                // If no user data found in production, this is an error
                if (process.env.NODE_ENV !== 'development') {
                    console.error('Error: No user data found in Telegram WebApp initData');
                    return res.status(401).json({
                        error: 'Authentication incomplete',
                        message: 'User data not found in Telegram WebApp data'
                    });
                }
            }
        } catch (error) {
            console.error('Error parsing user data:', error);
        }
        
        // If we still don't have a user in development mode, use a fallback
        if (!req.telegramUser && (process.env.NODE_ENV === 'development' || 
            req.headers.origin?.includes('localhost') || 
            req.headers.host?.includes('localhost'))) {
            
            console.log('Using local development fallback user');
            req.telegramUser = {
                id: 594235906,
                username: "dev_user",
                first_name: "Dev",
                last_name: "User"
            };
        }
        
        // Continue to the next middleware
        next();
    };
}

module.exports = {
    telegramAuthMiddleware,
    validateTelegramWebAppData
};
