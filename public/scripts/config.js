// API Configuration
const API_CONFIG = {
    // Change this to your deployed API URL when deploying
    // local development: http://localhost:10000/api
    // production: https://webapp.onrender.com/api
    API_BASE_URL: 'https://webapp.onrender.com/api',
    
    // Helper methods for API calls
    getApiUrl: function(endpoint) {
        return `${this.API_BASE_URL}/${endpoint}`;
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

// Export the config
window.API_CONFIG = API_CONFIG;