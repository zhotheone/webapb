// Ratings Module with Sorting and Filtering
let mediaData = [];
let currentPage = 1;
const itemsPerPage = 12;
let isLoading = false;
let hasMoreItems = true;
let currentUserId = '594235906'; // This will be set from Telegram WebApp user

// Sorting and filtering state
let currentSort = {
    field: 'timestamp',
    order: 'desc'
};

let currentFilter = {
    type: null,
    year: null, 
    rating: null
};


// Available filter options
let filterOptions = {
    mediaTypes: [],
    years: [],
    ratings: []
};

// Initialize ratings module
document.addEventListener('DOMContentLoaded', function() {
    // Get user ID from Telegram WebApp if available
    if (telegram.initDataUnsafe && telegram.initDataUnsafe.user) {
        currentUserId = telegram.initDataUnsafe.user.id.toString();
    }
    
    // Setup infinite scroll for media grid
    setupInfiniteScroll();
    
    // Setup search functionality
    setupSearch();
    
    // Setup sort and filter functionality
    setupSortAndFilter();
});

// Load media ratings
function loadMediaRatings() {
    // Reset page and flags when loading ratings tab
    currentPage = 1;
    hasMoreItems = true;
    mediaData = [];
    
    // Load user's collection
    loadUserCollection();
    
    // Load filter options
    loadFilterOptions();
}

// Load user's collection from API
async function loadUserCollection() {
    if (isLoading) return;
    
    isLoading = true;
    
    // Show loading indicator
    const mediaGrid = document.getElementById('mediaGrid');
    if (!mediaGrid) return;
    
    mediaGrid.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Завантаження колекції...</p>
        </div>
    `;
    
    try {
        // Build the API URL with sorting and filtering parameters
        let apiUrl = `rate/collection/${currentUserId}`;
        
        // Add query parameters
        const queryParams = [];
        
        // Add sorting parameters
        queryParams.push(`sortField=${encodeURIComponent(currentSort.field || 'timestamp')}`);
        queryParams.push(`sortOrder=${encodeURIComponent(currentSort.order || 'desc')}`);
        
        // Add filtering parameters if they exist
        if (currentFilter.type) {
            queryParams.push(`filterType=${encodeURIComponent(currentFilter.type)}`);
        }
        if (currentFilter.year) {
            queryParams.push(`filterYear=${encodeURIComponent(currentFilter.year)}`);
        }
        if (currentFilter.rating) {
            queryParams.push(`filterRating=${encodeURIComponent(currentFilter.rating)}`);
        }
        
        // Add query string to URL
        if (queryParams.length > 0) {
            apiUrl += '?' + queryParams.join('&');
        }
        
        console.log('Loading collection with URL:', apiUrl);
        
        // Use our improved CORS-aware fetch wrapper
        const data = await API_CONFIG.fetchWithCORS(apiUrl);
        
        // Clear loading indicator
        mediaGrid.innerHTML = '';
        
        if (data.results && data.results.length > 0) {
            // Store the items
            mediaData = data.results;
            
            // Render items
            renderMediaItems(data.results, mediaGrid);
        } else {
            let noItemsMessage = '<p class="no-items-message">У вашій колекції ще немає медіа. Скористайтеся пошуком, щоб додати! 🎬</p>';
            
            // If filtering is active and no results, show a different message
            if (currentFilter.type || currentFilter.year || currentFilter.rating) {
                noItemsMessage = '<p class="no-items-message">Немає результатів за обраними фільтрами. Спробуйте змінити параметри фільтрації. 🔍</p>';
            }
            
            mediaGrid.innerHTML = noItemsMessage;
        }
        
        // Update the sort and filter UI
        updateSortAndFilterUI();
        
    } catch (error) {
        console.error('Error loading collection:', error);
        mediaGrid.innerHTML = `
            <div class="currency-error">
                <span class="material-icons">error_outline</span>
                <p>Помилка завантаження колекції: ${error.message}</p>
                <button id="retryCollectionBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retryCollectionBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                loadUserCollection();
            });
        }
    } finally {
        isLoading = false;
    }
}

// Load available filter options
async function loadFilterOptions() {
    try {
        console.log(`Loading filter options for user: ${currentUserId}`);
        
        // Use our improved CORS-aware fetch wrapper
        filterOptions = await API_CONFIG.fetchWithCORS(`rate/filters/${currentUserId}`);
        
        // Update the filter UI with available options
        populateFilterOptions();
    } catch (error) {
        console.error('Error loading filter options:', error);
        // Use empty defaults if the endpoint fails
        filterOptions = {
            mediaTypes: [],
            years: [],
            ratings: []
        };
        populateFilterOptions();
    }
}

// Populate filter dropdown options
function populateFilterOptions() {
    const typeFilter = document.getElementById('typeFilter');
    const yearFilter = document.getElementById('yearFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    
    if (!typeFilter || !yearFilter || !ratingFilter) return;
    
    // Clear existing options except for the first one (All)
    typeFilter.innerHTML = '<option value="">Усі типи 🎭</option>';
    yearFilter.innerHTML = '<option value="">Усі роки 📅</option>';
    ratingFilter.innerHTML = '<option value="">Усі оцінки ⭐</option>';
    
    // Add media type options
    filterOptions.mediaTypes.forEach(type => {
        const emoji = getMediaTypeEmoji(type);
        const label = getMediaTypeLabel(type);
        typeFilter.innerHTML += `<option value="${type}">${emoji} ${label}</option>`;
    });
    
    // Add year options (sorted newest first)
    filterOptions.years.sort((a, b) => b - a).forEach(year => {
        yearFilter.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    // Add rating options (sorted highest first)
    filterOptions.ratings.forEach(rating => {
        ratingFilter.innerHTML += `<option value="${rating}">${rating}/10 ⭐</option>`;
    });
    
    // Set the selected values based on current filter
    if (currentFilter.type) typeFilter.value = currentFilter.type;
    if (currentFilter.year) yearFilter.value = currentFilter.year;
    if (currentFilter.rating) ratingFilter.value = currentFilter.rating;
}

// Setup sort and filter functionality
function setupSortAndFilter() {
    // Sort dropdown change handler
    const sortField = document.getElementById('sortField');
    const sortOrder = document.getElementById('sortOrder');
    
    if (sortField) {
        sortField.addEventListener('change', () => {
            // Update current sort state
            currentSort.field = sortField.value;
            console.log(`Sort field changed to: ${currentSort.field}`);
            // Reload collection with new sort
            loadUserCollection();
        });
    }
    
    if (sortOrder) {
        sortOrder.addEventListener('change', () => {
            // Update current sort state
            currentSort.order = sortOrder.value;
            console.log(`Sort order changed to: ${currentSort.order}`);
            // Reload collection with new sort
            loadUserCollection();
        });
    }
    
    // Filter dropdowns change handlers
    const typeFilter = document.getElementById('typeFilter');
    const yearFilter = document.getElementById('yearFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    
    if (typeFilter) {
        typeFilter.addEventListener('change', () => {
            currentFilter.type = typeFilter.value || null;
            loadUserCollection();
        });
    }
    
    if (yearFilter) {
        yearFilter.addEventListener('change', () => {
            currentFilter.year = yearFilter.value || null;
            loadUserCollection();
        });
    }
    
    if (ratingFilter) {
        ratingFilter.addEventListener('change', () => {
            currentFilter.rating = ratingFilter.value || null;
            loadUserCollection();
        });
    }
    
    // Clear all filters button
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            // Reset all filters
            currentFilter = {
                type: null,
                year: null,
                rating: null
            };
            
            // Reset dropdown selections
            if (typeFilter) typeFilter.value = '';
            if (yearFilter) yearFilter.value = '';
            if (ratingFilter) ratingFilter.value = '';
            
            // Reload the collection
            loadUserCollection();
        });
    }
}

// Update the sort and filter UI based on current state
function updateSortAndFilterUI() {
    const sortField = document.getElementById('sortField');
    const sortOrder = document.getElementById('sortOrder');
    
    // Update sort dropdowns to match current state
    if (sortField && currentSort.field) {
        sortField.value = currentSort.field;
    }
    
    if (sortOrder && currentSort.order) {
        sortOrder.value = currentSort.order;
    }
    
    // Update filter dropdowns to match current state
    const typeFilter = document.getElementById('typeFilter');
    const yearFilter = document.getElementById('yearFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    
    if (typeFilter && currentFilter.type) {
        typeFilter.value = currentFilter.type;
    }
    
    if (yearFilter && currentFilter.year) {
        yearFilter.value = currentFilter.year;
    }
    
    if (ratingFilter && currentFilter.rating) {
        ratingFilter.value = currentFilter.rating;
    }
    
    // Update filter badge visibility
    const filterBadge = document.getElementById('filterBadge');
    
    if (filterBadge) {
        const hasActiveFilters = currentFilter.type || currentFilter.year || currentFilter.rating;
        filterBadge.style.display = hasActiveFilters ? 'inline-flex' : 'none';
    }
}

// Perform search via API
async function performSearch(query) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    // Show loading indicator
    searchResults.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Пошук...</p>
        </div>
    `;
    
    try {
        // Fetch search results from API
        const response = await fetch(API_CONFIG.getApiUrl(`rate/search/${encodeURIComponent(query)}`));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            searchResults.innerHTML = '';
            
            data.results.forEach(item => {
                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                
                // Create background color based on item id
                const bgColor = getRandomColor(item.id);
                
                // Determine if this item is already in user's collection
                const userRating = getUserRatingForMedia(item.id);
                const ratingDisplay = userRating ? 
                    `<div class="search-result-user-rating"><span class="material-icons">star</span> ${userRating}/10</div>` : 
                    '<div class="search-result-add">Додати до колекції ➕</div>';
                
                resultItem.innerHTML = `
                    <div class="search-result-poster" style="background-color: ${bgColor}">
                        ${item.poster_path ? 
                            `<img src="${item.poster_path}" alt="${item.title}" onerror="this.style.display='none'; this.parentNode.innerHTML='<span class=\\'material-icons\\' style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: rgba(255,255,255,0.7);\\'>local_movies</span>';">` : 
                            `<span class="material-icons" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: rgba(255,255,255,0.7);">
                                ${getMediaTypeIcon(item.media_type)}
                            </span>`
                        }
                    </div>
                    <div class="search-result-info">
                        <div class="search-result-title">${item.title}</div>
                        <div class="search-result-details">
                            ${getMediaTypeEmoji(item.media_type)} ${getMediaTypeLabel(item.media_type)} • ${item.release_date}
                        </div>
                        ${ratingDisplay}
                    </div>
                `;
                
                // Add click handler
                resultItem.addEventListener('click', () => {
                    showMediaRatingDialog(item);
                });
                
                searchResults.appendChild(resultItem);
                
                // Add staggered fade-in animation
                setTimeout(() => {
                    resultItem.style.opacity = '0';
                    resultItem.style.transition = 'opacity 0.3s ease-out';
                    
                    setTimeout(() => {
                        resultItem.style.opacity = '1';
                    }, 10);
                }, 100 * data.results.indexOf(item));
            });
        } else {
            searchResults.innerHTML = '<p class="search-prompt">Нічого не знайдено 😔</p>';
        }
    } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = `
            <div class="currency-error">
                <span class="material-icons">error_outline</span>
                <p>Помилка пошуку. Спробуйте пізніше.</p>
                <button id="retrySearchBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retrySearchBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                performSearch(query);
            });
        }
    }
}

// Check if user has already rated this media
function getUserRatingForMedia(imdbId) {
    const ratedItem = mediaData.find(item => item.id === imdbId);
    return ratedItem ? ratedItem.userRating : null;
}

// Render media items
function renderMediaItems(items, container) {
    container.innerHTML = ''; // Clear container first
    
    items.forEach(item => {
        const mediaCard = document.createElement('div');
        mediaCard.className = 'media-card';
        mediaCard.setAttribute('data-id', item.id);
        
        // Background color for placeholder
        const bgColor = getRandomColor(item.id);
        
        mediaCard.innerHTML = `
            <div class="media-poster" style="background-color: ${bgColor}">
                <span class="media-type-badge">${getMediaTypeEmoji(item.media_type)} ${getMediaTypeShortLabel(item.media_type)}</span>
                ${item.poster_path ? 
                    `<img src="${item.poster_path}" alt="${item.title}" onerror="this.style.display='none'; this.parentNode.innerHTML+='<span class=\\'material-icons\\' style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; color: rgba(255,255,255,0.7);\\'>local_movies</span>';">` : 
                    `<span class="material-icons" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; color: rgba(255,255,255,0.7);">
                        ${getMediaTypeIcon(item.media_type)}
                    </span>`
                }
            </div>
            <div class="media-info">
                <div class="media-title">${item.title}</div>
                <div class="media-year">${item.release_date}</div>
                <div class="media-rating">
                    <span class="material-icons">star</span>
                    ${item.userRating}/10
                </div>
            </div>
        `;
        
        // Add click handler
        mediaCard.addEventListener('click', () => {
            showMediaDetails(item);
        });
        
        container.appendChild(mediaCard);
        
        // Add staggered fade-in animation
        setTimeout(() => {
            mediaCard.style.opacity = '0';
            mediaCard.style.transform = 'translateY(20px)';
            mediaCard.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            
            setTimeout(() => {
                mediaCard.style.opacity = '1';
                mediaCard.style.transform = 'translateY(0)';
            }, 10);
        }, 50 * (items.indexOf(item) % 10));
    });
}

// Show media details with option to re-rate or delete
function showMediaDetails(item) {
    // Create a well-formatted text message that will display properly in the dialog
    const detailsMessage = `
Тип: ${getMediaTypeEmoji(item.media_type)} ${getMediaTypeLabel(item.media_type)}
Реліз: ${item.release_date}
Ваша оцінка: ⭐ ${item.userRating}/10

${item.details?.imdbRating ? `IMDB: ${item.details.imdbRating}` : ''}
${item.details?.plot ? `\nСюжет: ${item.details.plot}` : ''}
${item.details?.director ? `\nРежисер: ${item.details.director}` : ''}
${item.details?.genre ? `\nЖанр: ${item.details.genre}` : ''}`;
    
    API_CONFIG.showCustomDialog({
        title: item.title,
        message: detailsMessage,
        buttons: [
            {id: 'rate', type: 'default', text: 'Змінити оцінку ✏️'},
            {id: 'delete', type: 'destructive', text: 'Видалити 🗑️'},
            {id: 'close', type: 'cancel', text: 'Закрити ✖️'}
        ]
    }, function(buttonId) {
        if (buttonId === 'rate') {
            showMediaRatingDialog(item);
        } else if (buttonId === 'delete') {
            deleteMediaRating(item);
        }
    });
}

// Show dialog to rate media
function showMediaRatingDialog(item) {
    const currentRating = getUserRatingForMedia(item.id) || 0;
    
    // Make sure item has the required properties
    if (!item) {
        console.error('Invalid item object provided to showMediaRatingDialog');
        API_CONFIG.showToast('Помилка: Некоректні дані медіа');
        return;
    }
    
    // Create rating options
    const buttons = [];
    for (let i = 10; i >= 1; i--) {
        buttons.push({
            id: `rating_${i}`,
            type: i === currentRating ? 'default' : 'text',
            text: `${i}/10 ${i === currentRating ? '✓' : ''}`
        });
    }
    buttons.push({id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'});
    
    // Make sure we have a valid title and release_date
    const title = item.title || 'Невідома назва';
    const releaseDate = item.release_date || '';
    const mediaType = item.media_type || 'unknown';
    
    const messageContent = `${getMediaTypeEmoji(mediaType)} ${title} ${releaseDate ? `(${releaseDate})` : ''}
        
Виберіть оцінку:`;
    
    API_CONFIG.showCustomDialog({
        title: `Оцінити: ${title}`,
        message: messageContent,
        buttons: buttons
    }, function(buttonId) {
        if (buttonId !== 'cancel' && buttonId.startsWith('rating_')) {
            try {
                const rating = parseInt(buttonId.split('_')[1]);
                addMediaRating(item, rating);
            } catch (error) {
                console.error('Error parsing rating:', error);
                API_CONFIG.showToast('Помилка додавання оцінки');
            }
        }
    });
}

// Add or update media rating
async function addMediaRating(item, rating) {
    // Show loading indicator
    API_CONFIG.showToast('Зберігаємо оцінку...');
    
    try {
        // Fix: Convert rating to number if it's not already
        const ratingValue = parseFloat(rating);
        
        if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 10) {
            throw new Error('Неправильна оцінка. Оцінка повинна бути числом від 0 до 10.');
        }
        
        // Call API to add rating
        // Construct the URL with parameters in the correct format
        const imdbId = item.id;
        
        console.log(`Adding rating for media ID: ${imdbId}, rating: ${ratingValue}`);
        
        // Using direct parameter embedding to avoid parsing issues
        const apiUrl = `rate/add/${currentUserId}_${imdbId}_${ratingValue}`;
        const response = await fetch(API_CONFIG.getApiUrl(apiUrl));
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`API Error details:`, errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update local data if needed
            const existingIndex = mediaData.findIndex(media => media.id === item.id);
            if (existingIndex >= 0) {
                // Update existing item
                mediaData[existingIndex].userRating = ratingValue;
            } else {
                // Add new item to the beginning of the array
                mediaData.unshift({
                    ...item,
                    userRating: ratingValue
                });
            }
            
            // Reload the collection to show updated ratings
            loadUserCollection();
            
            // Show success message
            API_CONFIG.showToast('Оцінку збережено! ✅');
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Rating error:', error);
        API_CONFIG.showToast(`Помилка збереження оцінки: ${error.message} ❌`);
    }
}

// Delete media rating
async function deleteMediaRating(item) {
    // Ask for confirmation
    API_CONFIG.showCustomDialog({
        title: 'Видалення оцінки',
        message: `Ви впевнені, що хочете видалити "${item.title}" з вашої колекції?`,
        buttons: [
            {id: 'confirm', type: 'destructive', text: 'Видалити 🗑️'},
            {id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'}
        ]
    }, async function(buttonId) {
        if (buttonId === 'confirm') {
            // Show loading indicator
            API_CONFIG.showToast('Видаляємо...');
            
            try {
                // Call API to remove rating
                const response = await fetch(API_CONFIG.getApiUrl(`rate/remove/${currentUserId}/${item.id}`), {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    // Remove item from local data
                    mediaData = mediaData.filter(media => media.id !== item.id);
                    
                    // Reload the collection
                    loadUserCollection();
                    
                    // Show success message
                    API_CONFIG.showToast('Оцінку видалено! ✅');
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
            } catch (error) {
                console.error('Delete error:', error);
                API_CONFIG.showToast('Помилка видалення оцінки ❌');
            }
        }
    });
}

// Setup infinite scroll
function setupInfiniteScroll() {
    // Note: With our API implementation, we're loading all data at once
    // so we don't need true infinite scroll, but we keep the structure for future expansion
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchResults = document.getElementById('searchResults');
    
    if (!searchInput || !searchClearBtn || !searchResults) return;
    
    // Debounce search to avoid too many API calls
    let searchTimeout = null;
    
    // Show/hide clear button based on input content
    searchInput.addEventListener('input', () => {
        const hasText = searchInput.value.trim().length > 0;
        searchClearBtn.classList.toggle('visible', hasText);
        
        // Clear previous timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        if (hasText) {
            // Set new timeout for search
            searchTimeout = setTimeout(() => {
                performSearch(searchInput.value.trim());
            }, 500); // Wait 500ms after typing stops
        } else {
            searchResults.innerHTML = '<p class="search-prompt">Введіть назву для пошуку 🔍</p>';
        }
    });
    
    // Clear button functionality
    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.classList.remove('visible');
        searchResults.innerHTML = '<p class="search-prompt">Введіть назву для пошуку 🔍</p>';
    });
}

// Helper functions for media types
function getMediaTypeIcon(type) {
    switch(type?.toLowerCase()) {
        case 'movie':
            return 'movie';
        case 'series':
        case 'tvshow':
        case 'tv':
            return 'tv';
        case 'game':
            return 'sports_esports';
        default:
            return 'theaters';
    }
}

function getMediaTypeLabel(type) {
    switch(type?.toLowerCase()) {
        case 'movie':
            return 'Фільм';
        case 'series':
        case 'tvshow':
        case 'tv':
            return 'Серіал';
        case 'game':
            return 'Гра';
        default:
            return 'Медіа';
    }
}

function getMediaTypeShortLabel(type) {
    switch(type?.toLowerCase()) {
        case 'movie':
            return 'Фільм';
        case 'series':
        case 'tvshow':
        case 'tv':
            return 'Серіал';
        case 'game':
            return 'Гра';
        default:
            return 'Медіа';
    }
}

function getMediaTypeEmoji(type) {
    switch(type?.toLowerCase()) {
        case 'movie':
            return '🎬';
        case 'series':
        case 'tvshow':
        case 'tv':
            return '📺';
        case 'game':
            return '🎮';
        default:
            return '📀';
    }
}

// Generate random color based on seed
function getRandomColor(seed) {
    // Generate a deterministic color based on seed
    const hue = (String(seed).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 360);
    return `hsl(${hue}, 70%, 35%)`;
}