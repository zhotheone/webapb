// Global User Initialization Module
let currentUserId = null;

// Initialize as early as possible to ensure user ID is available
(function initializeUser() {
    try {
        // Try to get user ID from Telegram WebApp
        if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            currentUserId = window.Telegram.WebApp.initDataUnsafe.user.id.toString();
            console.log(`✅ Користувача ініціалізовано з ID: ${currentUserId}`);
        } else {
            // Fallback for testing environments
            currentUserId = '594235906';
            console.log(`⚠️ Використовуємо тестовий ID користувача: ${currentUserId}`);
        }
    } catch (error) {
        // Handle errors gracefully
        console.error(`❌ Помилка ініціалізації користувача: ${error.message}`);
        currentUserId = 'fallback_user';
    }
    
    // Dispatch an event so other modules know the user is initialized
    window.dispatchEvent(new CustomEvent('userInitialized', {
        detail: { userId: currentUserId }
    }));
})();

// Function to safely get the current user ID
function getCurrentUserId() {
    return currentUserId || 'guest_user';
}