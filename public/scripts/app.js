// Initialize Telegram WebApp
const telegram = window.Telegram?.WebApp || {
    initDataUnsafe: { user: { id: 'test_user', first_name: 'Тестовий', last_name: 'Користувач' } },
    expand: function() { console.log('Telegram WebApp expand called'); },
    ready: function() { console.log('Telegram WebApp ready called'); },
    showPopup: function(params, callback) { 
        console.log('Telegram WebApp showPopup called with', params);
        // Use our custom dialog instead
        return null; 
    }
};

// Core app functionality
document.addEventListener('DOMContentLoaded', function() {
    // Expand to the maximum available height
    if (typeof telegram.expand === 'function') {
        telegram.expand();
    }
    
    // Initialize user info
    initUserInfo();
    
    // Setup tab navigation
    setupTabNavigation();
    
    // Setup subtab navigation
    setupSubtabNavigation();

    setupFilmsTabNavigation();

    setupBooksTabNavigation();
    
    // Trigger active tab to load its content
    const activeTab = document.querySelector('.nav-btn.active');
    if (activeTab) {
        const tabId = activeTab.getAttribute('data-tab');
        triggerTabContentLoad(tabId);
    }
    
    // Let telegram know we're ready
    if (typeof telegram.ready === 'function') {
        telegram.ready();
    }
});

// Initialize user information
function initUserInfo() {
    if (telegram.initDataUnsafe && telegram.initDataUnsafe.user) {
        const user = telegram.initDataUnsafe.user;
        
        // Set user name
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        }
        
        // Set user ID
        const userIdElement = document.getElementById('userId');
        if (userIdElement) {
            userIdElement.textContent = 'ID: ' + user.id;
        }
        
        // Set user avatar if available
        const userAvatarElement = document.getElementById('userAvatar');
        if (userAvatarElement && user.photo_url) {
            userAvatarElement.innerHTML = '';
            const avatarImg = document.createElement('img');
            avatarImg.src = user.photo_url;
            avatarImg.alt = 'User Avatar';
            userAvatarElement.appendChild(avatarImg);
        }
    } else {
        // Fallback for when user data is not available
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = 'Гість 👋';
        }
        
        const userIdElement = document.getElementById('userId');
        if (userIdElement) {
            userIdElement.textContent = 'Режим тестування';
        }
    }
}

// Setup tab navigation
function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and tabs
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.add('hidden'));
            
            // Add active class to clicked button and corresponding tab
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.remove('hidden');
                triggerTabContentLoad(tabId);
            }
            
            // Add subtle feedback animation
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = '';
            }, 150);
        });
    });
}

// Setup subtab navigation
function setupSubtabNavigation() {
    const subtabButtons = document.querySelectorAll('.subtab-btn');
    
    subtabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Get parent tab container
            const parentTab = button.closest('.tab-content');
            if (!parentTab) return;
            
            // Find all subtab buttons and contents within this tab
            const siblingButtons = parentTab.querySelectorAll('.subtab-btn');
            const subtabContents = parentTab.querySelectorAll('.subtab-content');
            
            // Remove active class from all sibling buttons and contents
            siblingButtons.forEach(btn => btn.classList.remove('active'));
            subtabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const subtabId = button.getAttribute('data-subtab');
            const subtabContent = document.getElementById(subtabId + 'Content');
            if (subtabContent) {
                subtabContent.classList.add('active');
                // Load content specific to this subtab
                if (subtabId === 'books') {
                    if (typeof loadBooksData === 'function') {
                        console.log('Loading books data after subtab change');
                        loadBooksData();
                    }
                } else if (subtabId === 'films') {
                    if (typeof loadMediaRatings === 'function') {
                        console.log('Loading media ratings after subtab change');
                        loadMediaRatings();
                    }
                }
            }
        });
    });
}

function setupBooksTabNavigation() {
    const bookTabButtons = document.querySelectorAll('.books-tab-btn');
    
    bookTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Get parent container
            const booksContent = document.getElementById('booksContent');
            if (!booksContent) return;
            
            // Find all book tab buttons and sections
            const siblingButtons = booksContent.querySelectorAll('.books-tab-btn');
            const bookSections = booksContent.querySelectorAll('.books-section');
            
            // Remove active class from all buttons and sections
            siblingButtons.forEach(btn => btn.classList.remove('active'));
            bookSections.forEach(section => section.classList.remove('active'));
            
            // Add active class to clicked button and corresponding section
            button.classList.add('active');
            const bookTabId = button.getAttribute('data-booktab');
            
            let sectionId;
            switch(bookTabId) {
                case 'collection':
                    sectionId = 'bookCollectionSection';
                    // Load book collection when this tab is selected
                    if (typeof loadBooksCollection === 'function') {
                        console.log('Loading books collection after tab change');
                        loadBooksCollection();
                    }
                    break;
                case 'search':
                    sectionId = 'bookSearchSection';
                    break;
                case 'stats':
                    sectionId = 'bookStatsSection';
                    // Load book stats when this tab is selected
                    if (typeof loadBookStatistics === 'function') {
                        console.log('Loading book statistics after tab change');
                        loadBookStatistics();
                    }
                    break;
                default:
                    sectionId = 'bookCollectionSection';
            }
            
            const bookSection = document.getElementById(sectionId);
            if (bookSection) {
                bookSection.classList.add('active');
            }
        });
    });
}

function setupFilmsTabNavigation() {
    const filmTabButtons = document.querySelectorAll('.films-tab-btn');
    
    filmTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Get parent container
            const filmsContent = document.getElementById('ratingsTab');
            if (!filmsContent) return;
            
            // Find all film tab buttons and sections
            const siblingButtons = filmsContent.querySelectorAll('.films-tab-btn');
            const filmSections = filmsContent.querySelectorAll('.films-section');
            
            // Remove active class from all buttons and sections
            siblingButtons.forEach(btn => btn.classList.remove('active'));
            filmSections.forEach(section => section.classList.remove('active'));
            
            // Add active class to clicked button and corresponding section
            button.classList.add('active');
            const filmTabId = button.getAttribute('data-filmtab');
            
            let sectionId;
            switch(filmTabId) {
                case 'collection':
                    sectionId = 'filmGallerySection';
                    break;
                case 'search':
                    sectionId = 'filmSearchSection';
                    break;
                case 'stats':
                    sectionId = 'filmStatsSection';
                    // Load media statistics when this tab is selected
                    if (typeof loadMediaStatistics === 'function') {
                        console.log('Loading media statistics after tab change');
                        loadMediaStatistics();
                    }
                    break;
                default:
                    sectionId = 'filmGallerySection';
            }
            
            const filmSection = document.getElementById(sectionId);
            if (filmSection) {
                filmSection.classList.add('active');
                
                // If switching to search tab, focus the search input
                if (filmTabId === 'search') {
                    const searchInput = filmSection.querySelector('input[type="text"]');
                    if (searchInput) {
                        setTimeout(() => searchInput.focus(), 100);
                    }
                }
            }
        });
    });
}

// Виправлення в app.js - функція для завантаження вмісту вкладок

// Виклик функцій завантаження вмісту при активації вкладки
function triggerTabContentLoad(tabId) {
    console.log(`Активовано вкладку: ${tabId}`);
    
    switch(tabId) {
        case 'ratingsTab':
            // Check which subtab is active
            const activeSubtab = document.querySelector('.subtab-btn.active');
            if (activeSubtab) {
                const subtabId = activeSubtab.getAttribute('data-subtab');
                if (subtabId === 'books' && typeof loadBooksData === 'function') {
                    console.log('Викликаємо loadBooksData()');
                    loadBooksData();
                } else if (subtabId === 'films' && typeof loadMediaRatings === 'function') {
                    console.log('Викликаємо loadMediaRatings()');
                    loadMediaRatings();
                }
            } else if (typeof loadMediaRatings === 'function') {
                // Default to loading media ratings if no subtab is active
                console.log('Викликаємо loadMediaRatings() (за замовчуванням)');
                loadMediaRatings();
            }
            break;
        case 'trackerTab':
            if (typeof loadTrackerItems === 'function') {
                console.log('Викликаємо loadTrackerItems()');
                loadTrackerItems();
            }
            break;
        case 'weatherTab':
            if (typeof loadWeatherData === 'function') {
                console.log('Викликаємо loadWeatherData()');
                loadWeatherData();
            }
            break;
        case 'currencyTab':
            if (typeof loadCurrencyData === 'function') {
                console.log('Викликаємо loadCurrencyData()');
                loadCurrencyData();
            }
            break;
    }
}