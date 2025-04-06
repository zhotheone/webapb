// API Configuration
const API_CONFIG = {
    // API base URL - using relative path to avoid CORS issues as frontend and API are on the same origin
    API_BASE_URL: '/api',
    
    // Enable local mock data
    USE_MOCK_DATA: true,
    
    // Helper methods for API calls with improved error handling and CORS support
    getApiUrl: function(endpoint) {
        return `${this.API_BASE_URL}/${endpoint}`;
    },
    
    // Improved fetch wrapper with CORS handling
    fetchWithCORS: async function(endpoint, options = {}) {
        const url = this.getApiUrl(endpoint);
        console.log(`Fetching from: ${url}`);
        
        // Add CORS headers to every request
        const fetchOptions = {
            ...options,
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, fetchOptions);
            
            if (!response.ok) {
                console.warn(`API request failed: ${response.status} ${response.statusText}`);
                
                // If we have mock data enabled and the request failed, use mock data
                if (this.USE_MOCK_DATA) {
                    console.log(`Using mock data for: ${endpoint}`);
                    return this.getMockData(endpoint);
                }
                
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${url}:`, error);
            
            // If we have mock data enabled and the request failed, use mock data
            if (this.USE_MOCK_DATA) {
                console.log(`Using mock data for: ${endpoint}`);
                return this.getMockData(endpoint);
            }
            
            throw error;
        }
    },
    
    // Get appropriate mock data based on endpoint
    getMockData: function(endpoint) {
        if (endpoint.includes('rate/filters/')) {
            return this.MOCK_DATA.ratings.filters;
        } else if (endpoint.includes('rate/collection/')) {
            return this.MOCK_DATA.ratings.collection;
        }
        return { error: 'No mock data available for this endpoint' };
    },
        
    // Create a custom dialog that works outside of Telegram
    showCustomDialog: function(options, callback) {
        // First check if Telegram WebApp popup is available
        if (window.Telegram?.WebApp?.showPopup) {
            try {
                return window.Telegram.WebApp.showPopup(options, callback);
            } catch (e) {
                console.log('Telegram WebApp popup not available, using custom dialog');
                // Fall back to custom dialog
            }
        }
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'custom-dialog-overlay';
        
        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'custom-dialog';
        
        // Add title if provided
        if (options.title) {
            const title = document.createElement('div');
            title.className = 'custom-dialog-title';
            title.textContent = options.title;
            dialog.appendChild(title);
        }
        
        // Add message if provided
        if (options.message) {
            const message = document.createElement('div');
            message.className = 'custom-dialog-message';
            message.textContent = options.message;
            dialog.appendChild(message);
        }
        
        // Special case for rating dialog
        if (options.title && options.title.includes('Оцінити:')) {
            const ratingButtons = document.createElement('div');
            ratingButtons.className = 'rating-buttons';
            
            for (let i = 10; i >= 1; i--) {
                const button = document.createElement('button');
                button.className = 'rating-button';
                button.textContent = i;
                button.dataset.value = i;
                
                button.addEventListener('click', () => {
                    // Call callback with button ID
                    if (callback) callback(`rating_${i}`);
                    
                    // Close dialog
                    document.body.removeChild(overlay);
                });
                
                ratingButtons.appendChild(button);
            }
            
            dialog.appendChild(ratingButtons);
        }
        
        // Add buttons
        if (options.buttons && options.buttons.length > 0) {
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'custom-dialog-buttons';
            
            options.buttons.forEach(button => {
                const btn = document.createElement('button');
                btn.className = 'custom-dialog-button';
                btn.textContent = button.text;
                
                // Add button type
                if (button.type === 'default') btn.classList.add('primary');
                if (button.type === 'destructive') btn.classList.add('destructive');
                
                btn.addEventListener('click', () => {
                    // Call callback with button ID
                    if (callback) callback(button.id);
                    
                    // Close dialog
                    document.body.removeChild(overlay);
                });
                
                buttonsContainer.appendChild(btn);
            });
            
            dialog.appendChild(buttonsContainer);
        }
        
        // Add to DOM
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Animate in
        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);
        
        // Close when clicking outside if it's not a critical dialog
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // Only close if there's a cancel button
                const hasCancelButton = options.buttons && options.buttons.some(b => b.type === 'cancel');
                if (hasCancelButton) {
                    const cancelButton = options.buttons.find(b => b.type === 'cancel');
                    if (callback && cancelButton) callback(cancelButton.id);
                    document.body.removeChild(overlay);
                }
            }
        });
        
        // Return a function to close the dialog programmatically
        return {
            close: () => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
            }
        };
    },
    
    // Helper to show toasts
    showToast: function(message, duration = 3000) {
        // Create toast element if it doesn't exist
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        // Set message and show
        toast.textContent = message;
        toast.classList.add('show');
        
        // Hide after duration
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
};

// Add this to your config.js file or create a new utils.js file

// Utility functions for working with images
const IMAGE_UTILS = {
    // Use our proxy for external images to avoid CORS issues
    getProxiedImageUrl: function(originalUrl) {
        if (!originalUrl) return null;
        
        // Don't proxy local images or placeholder images
        if (originalUrl.startsWith('/') || originalUrl.includes('placeholder')) {
            return originalUrl;
        }
        
        // Return the proxied URL
        return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    },
    
    // Create image HTML with proper error handling
    createImageElement: function(src, alt, className = '') {
        if (!src) return '';
        
        // Use the proxied URL for external images
        const proxiedSrc = this.getProxiedImageUrl(src);
        
        // Generate proper HTML with fallback
        return `<img src="${proxiedSrc}" alt="${alt || 'Image'}" class="${className}" 
            onerror="this.onerror=null; this.src=''; this.style.display='none'; this.parentNode.innerHTML+='<span class=\\'material-icons\\' style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 36px; color: rgba(255,255,255,0.7);\\'>image_not_supported</span>';">`;
    }
};

// Add to window object if needed
window.IMAGE_UTILS = IMAGE_UTILS;
// Export the config
window.API_CONFIG = API_CONFIG;