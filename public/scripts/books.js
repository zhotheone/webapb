// Books Module with Sorting and Filtering
let booksData = [];
let isLoadingBooks = false;

// Reading status labels
const readingStatusLabels = {
    'reading': 'Читаю зараз 📖',
    'to-read': 'Планую прочитати 📚',
    'finished': 'Прочитано ✓'
};

// Reading status icons
const readingStatusIcons = {
    'reading': 'auto_stories',
    'to-read': 'bookmark',
    'finished': 'task_alt'
};

// Sorting and filtering state
let bookSort = {
    field: 'timestamp',
    order: 'desc'
};

let bookFilter = {
    type: null,
    year: null, 
    rating: null,
    author: null,
    category: null,
    language: null,
    readingStatus: null
};

// Available filter options
let bookFilterOptions = {
    types: [],
    years: [],
    ratings: [],
    authors: [],
    categories: [],
    languages: []
};

// Initialize books module
document.addEventListener('DOMContentLoaded', function() {
    // Setup books functionality when DOM is ready
    setupBooksSearch();
    setupBooksSort();
    setupBooksFilter();
    
    // Listen for user initialized event
    window.addEventListener('userInitialized', function(e) {
        console.log('📚 Книги: отримано подію ініціалізації користувача');
    });
});

// Load books when the tab is opened
function loadBooksData() {
    console.log('📚 Завантаження книг для користувача:', getCurrentUserId());
    
    // Clear existing data
    booksData = [];
    
    // Load user's book collection
    loadBooksCollection();
    
    // Load filter options
    loadBooksFilterOptions();
    
    // Load book statistics for dashboard
    loadBookStatistics();
}

// Load user's books collection from API
async function loadBooksCollection() {
    if (isLoadingBooks) return;
    
    isLoadingBooks = true;
    
    // Show loading indicator
    const booksGrid = document.getElementById('booksGrid');
    if (!booksGrid) return;
    
    booksGrid.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Завантаження книг...</p>
        </div>
    `;
    
    try {
        // Build the API URL with sorting and filtering parameters
        let apiUrl = `books/collection/${getCurrentUserId()}`;
        
        // Add query parameters
        const queryParams = [];
        
        // Add sorting parameters
        queryParams.push(`sortField=${encodeURIComponent(bookSort.field || 'timestamp')}`);
        queryParams.push(`sortOrder=${encodeURIComponent(bookSort.order || 'desc')}`);
        
        console.log("📚 Підготовка запиту колекції книг з параметрами:", queryParams.join('&'));
        
        // Add filtering parameters if they exist
        if (bookFilter.type) {
            queryParams.push(`filterType=${encodeURIComponent(bookFilter.type)}`);
        }
        if (bookFilter.year) {
            queryParams.push(`filterYear=${encodeURIComponent(bookFilter.year)}`);
        }
        if (bookFilter.rating) {
            queryParams.push(`filterRating=${encodeURIComponent(bookFilter.rating)}`);
        }
        if (bookFilter.author) {
            queryParams.push(`filterAuthor=${encodeURIComponent(bookFilter.author)}`);
        }
        if (bookFilter.category) {
            queryParams.push(`filterCategory=${encodeURIComponent(bookFilter.category)}`);
        }
        if (bookFilter.language) {
            queryParams.push(`filterLanguage=${encodeURIComponent(bookFilter.language)}`);
        }
        if (bookFilter.readingStatus) {
            queryParams.push(`filterReadingStatus=${encodeURIComponent(bookFilter.readingStatus)}`);
        }
        
        // Add query string to URL
        if (queryParams.length > 0) {
            apiUrl += '?' + queryParams.join('&');
        }
        
        console.log('📚 Завантаження колекції книг з URL:', apiUrl);
        
        // Fetch data using our API helper
        const data = await API_CONFIG.fetchWithCORS(apiUrl);
        
        // Clear loading indicator
        booksGrid.innerHTML = '';
        
        if (data.results && data.results.length > 0) {
            // Store the items
            booksData = data.results;
            
            // Render items
            renderBooksItems(data.results, booksGrid);
        } else {
            let noItemsMessage = '<p class="no-items-message">У вашій колекції ще немає книг. Скористайтеся пошуком, щоб додати! 📚</p>';
            
            // If filtering is active and no results, show a different message
            if (hasActiveFilters()) {
                noItemsMessage = '<p class="no-items-message">Немає результатів за обраними фільтрами. Спробуйте змінити параметри фільтрації. 🔍</p>';
            }
            
            booksGrid.innerHTML = noItemsMessage;
        }
        
        // Update the sort and filter UI
        updateBooksSortAndFilterUI();
        
    } catch (error) {
        console.error('❌ Помилка завантаження колекції книг:', error);
        booksGrid.innerHTML = `
            <div class="books-error">
                <span class="material-icons">error_outline</span>
                <p>Помилка завантаження колекції книг: ${error.message}</p>
                <button id="retryBooksBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retryBooksBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                loadBooksCollection();
            });
        }
    } finally {
        isLoadingBooks = false;
    }
}

// Check if any filters are active
function hasActiveFilters() {
    return bookFilter.type || 
           bookFilter.year || 
           bookFilter.rating || 
           bookFilter.author || 
           bookFilter.category || 
           bookFilter.language || 
           bookFilter.readingStatus;
}

// Load available filter options
async function loadBooksFilterOptions() {
    try {
        const apiUrl = `books/filters/${getCurrentUserId()}`;
        console.log(`📚 Завантаження параметрів фільтрації з: ${API_CONFIG.getApiUrl(apiUrl)}`);
        
        // Use fetchWithCORS for consistent CORS handling
        bookFilterOptions = await API_CONFIG.fetchWithCORS(apiUrl);
        console.log("✅ Параметри фільтрації книг завантажено:", bookFilterOptions);
        
        // Update the filter UI with available options
        populateBooksFilterOptions();
    } catch (error) {
        console.error('❌ Помилка завантаження параметрів фільтрації книг:', error);
        // Use empty defaults if the endpoint fails
        bookFilterOptions = {
            types: [],
            years: [],
            ratings: [],
            authors: [],
            categories: [],
            languages: []
        };
        populateBooksFilterOptions();
    }
}

// Load book statistics
async function loadBookStatistics() {
    const statsContainer = document.getElementById('bookStats');
    if (!statsContainer) return;
    
    try {
        const apiUrl = `books/stats/${getCurrentUserId()}`;
        const stats = await API_CONFIG.fetchWithCORS(apiUrl);
        
        // Render statistics
        renderBookStatistics(stats, statsContainer);
    } catch (error) {
        console.error('❌ Помилка завантаження статистики книг:', error);
        statsContainer.innerHTML = `
            <div class="stats-error">
                <p>Не вдалося завантажити статистику книг</p>
            </div>
        `;
    }
}

// Render book statistics
function renderBookStatistics(stats, container) {
    container.innerHTML = `
        <div class="books-stats-grid">
            <div class="stats-card">
                <div class="stats-icon"><span class="material-icons">auto_stories</span></div>
                <div class="stats-value">${stats.totalBooks}</div>
                <div class="stats-label">Всього книг</div>
            </div>
            <div class="stats-card">
                <div class="stats-icon"><span class="material-icons">task_alt</span></div>
                <div class="stats-value">${stats.booksRead}</div>
                <div class="stats-label">Прочитано</div>
            </div>
            <div class="stats-card">
                <div class="stats-icon"><span class="material-icons">menu_book</span></div>
                <div class="stats-value">${stats.booksReading}</div>
                <div class="stats-label">Читаю зараз</div>
            </div>
            <div class="stats-card">
                <div class="stats-icon"><span class="material-icons">bookmark</span></div>
                <div class="stats-value">${stats.booksToRead}</div>
                <div class="stats-label">Планую</div>
            </div>
            <div class="stats-card">
                <div class="stats-icon"><span class="material-icons">description</span></div>
                <div class="stats-value">${stats.totalPages}</div>
                <div class="stats-label">Сторінок</div>
            </div>
            <div class="stats-card">
                <div class="stats-icon"><span class="material-icons">star</span></div>
                <div class="stats-value">${stats.averageRating}</div>
                <div class="stats-label">Середня оцінка</div>
            </div>
        </div>
        
        <div class="books-stats-favorites">
            <div class="stats-favorites-section">
                <h3>Улюблені категорії</h3>
                <ul class="favorites-list">
                    ${stats.favoriteCategories.map(item => `
                        <li><span class="favorite-name">${item.category}</span> <span class="favorite-count">${item.count}</span></li>
                    `).join('')}
                </ul>
            </div>
            <div class="stats-favorites-section">
                <h3>Улюблені автори</h3>
                <ul class="favorites-list">
                    ${stats.favoriteAuthors.map(item => `
                        <li><span class="favorite-name">${item.author}</span> <span class="favorite-count">${item.count}</span></li>
                    `).join('')}
                </ul>
            </div>
        </div>
    `;
}

// Populate filter dropdown options
function populateBooksFilterOptions() {
    const typeFilter = document.getElementById('bookTypeFilter');
    const yearFilter = document.getElementById('bookYearFilter');
    const ratingFilter = document.getElementById('bookRatingFilter');
    const authorFilter = document.getElementById('bookAuthorFilter');
    const categoryFilter = document.getElementById('bookCategoryFilter');
    const statusFilter = document.getElementById('bookStatusFilter');
    
    if (!typeFilter || !yearFilter || !ratingFilter || !authorFilter || !categoryFilter || !statusFilter) return;
    
    // Clear existing options except for the first one (All)
    typeFilter.innerHTML = '<option value="">Усі типи 📚</option>';
    yearFilter.innerHTML = '<option value="">Усі роки 📅</option>';
    ratingFilter.innerHTML = '<option value="">Усі оцінки ⭐</option>';
    authorFilter.innerHTML = '<option value="">Усі автори ✍️</option>';
    categoryFilter.innerHTML = '<option value="">Усі категорії 🔖</option>';
    statusFilter.innerHTML = '<option value="">Будь-який статус 📖</option>';
    
    // Add type options
    bookFilterOptions.types.forEach(type => {
        const emoji = type === 'book' ? '📕' : '🗯️';
        const label = type === 'book' ? 'Книга' : 'Манга';
        typeFilter.innerHTML += `<option value="${type}">${emoji} ${label}</option>`;
    });
    
    // Add year options (sorted newest first)
    bookFilterOptions.years.forEach(year => {
        yearFilter.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    // Add rating options (sorted highest first)
    bookFilterOptions.ratings.forEach(rating => {
        ratingFilter.innerHTML += `<option value="${rating}">${rating}/10 ⭐</option>`;
    });
    
    // Add author options
    bookFilterOptions.authors.forEach(author => {
        authorFilter.innerHTML += `<option value="${author}">${author}</option>`;
    });
    
    // Add category options
    bookFilterOptions.categories.forEach(category => {
        categoryFilter.innerHTML += `<option value="${category}">${category}</option>`;
    });
    
    // Add reading status options
    statusFilter.innerHTML += `
        <option value="reading">📖 Читаю зараз</option>
        <option value="to-read">📚 Планую прочитати</option>
        <option value="finished">✓ Прочитано</option>
    `;
    
    // Set the selected values based on current filter
    if (bookFilter.type) typeFilter.value = bookFilter.type;
    if (bookFilter.year) yearFilter.value = bookFilter.year;
    if (bookFilter.rating) ratingFilter.value = bookFilter.rating;
    if (bookFilter.author) authorFilter.value = bookFilter.author;
    if (bookFilter.category) categoryFilter.value = bookFilter.category;
    if (bookFilter.readingStatus) statusFilter.value = bookFilter.readingStatus;
}

// Setup books search
function setupBooksSearch() {
    const searchInput = document.getElementById('bookSearchInput');
    const searchClearBtn = document.getElementById('bookSearchClearBtn');
    const searchResults = document.getElementById('bookSearchResults');
    
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
                performBooksSearch(searchInput.value.trim());
            }, 500); // Wait 500ms after typing stops
        } else {
            searchResults.innerHTML = '<p class="search-prompt">Введіть назву для пошуку книг 🔍</p>';
        }
    });
    
    // Clear button functionality
    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.classList.remove('visible');
        searchResults.innerHTML = '<p class="search-prompt">Введіть назву для пошуку книг 🔍</p>';
    });
}

// Setup books sort functionality
function setupBooksSort() {
    // Sort dropdown change handler
    const sortField = document.getElementById('bookSortField');
    const sortOrder = document.getElementById('bookSortOrder');
    
    if (sortField) {
        sortField.addEventListener('change', () => {
            // Update current sort state
            bookSort.field = sortField.value;
            console.log(`⚙️ Поле сортування книг змінено на: ${bookSort.field}`);
            // Reload collection with new sort
            loadBooksCollection();
        });
    }
    
    if (sortOrder) {
        sortOrder.addEventListener('change', () => {
            // Update current sort state
            bookSort.order = sortOrder.value;
            console.log(`⚙️ Порядок сортування книг змінено на: ${bookSort.order}`);
            // Reload collection with new sort
            loadBooksCollection();
        });
    }
}

// Setup books filter functionality
function setupBooksFilter() {
    // Filter dropdowns change handlers
    const typeFilter = document.getElementById('bookTypeFilter');
    const yearFilter = document.getElementById('bookYearFilter');
    const ratingFilter = document.getElementById('bookRatingFilter');
    const authorFilter = document.getElementById('bookAuthorFilter');
    const categoryFilter = document.getElementById('bookCategoryFilter');
    const statusFilter = document.getElementById('bookStatusFilter');
    const clearFiltersBtn = document.getElementById('clearBookFiltersBtn');
    
    // Type filter
    if (typeFilter) {
        typeFilter.addEventListener('change', () => {
            bookFilter.type = typeFilter.value || null;
            loadBooksCollection();
        });
    }
    
    // Year filter
    if (yearFilter) {
        yearFilter.addEventListener('change', () => {
            bookFilter.year = yearFilter.value || null;
            loadBooksCollection();
        });
    }
    
    // Rating filter
    if (ratingFilter) {
        ratingFilter.addEventListener('change', () => {
            bookFilter.rating = ratingFilter.value || null;
            loadBooksCollection();
        });
    }
    
    // Author filter
    if (authorFilter) {
        authorFilter.addEventListener('change', () => {
            bookFilter.author = authorFilter.value || null;
            loadBooksCollection();
        });
    }
    
    // Category filter
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            bookFilter.category = categoryFilter.value || null;
            loadBooksCollection();
        });
    }
    
    // Status filter
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            bookFilter.readingStatus = statusFilter.value || null;
            loadBooksCollection();
        });
    }
    
    // Clear all filters button
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            // Reset all filters
            bookFilter = {
                type: null,
                year: null,
                rating: null,
                author: null,
                category: null,
                language: null,
                readingStatus: null
            };
            
            // Reset dropdown selections
            if (typeFilter) typeFilter.value = '';
            if (yearFilter) yearFilter.value = '';
            if (ratingFilter) ratingFilter.value = '';
            if (authorFilter) authorFilter.value = '';
            if (categoryFilter) categoryFilter.value = '';
            if (statusFilter) statusFilter.value = '';
            
            // Reload the collection
            loadBooksCollection();
            
            // Notify user
            API_CONFIG.showToast('🔄 Фільтри скинуто');
        });
    }
}

// Update the books sort and filter UI based on current state
function updateBooksSortAndFilterUI() {
    const sortField = document.getElementById('bookSortField');
    const sortOrder = document.getElementById('bookSortOrder');
    
    // Update sort dropdowns to match current state
    if (sortField && bookSort.field) {
        sortField.value = bookSort.field;
    }
    
    if (sortOrder && bookSort.order) {
        sortOrder.value = bookSort.order;
    }
    
    // Update filter dropdowns to match current state
    const typeFilter = document.getElementById('bookTypeFilter');
    const yearFilter = document.getElementById('bookYearFilter');
    const ratingFilter = document.getElementById('bookRatingFilter');
    const authorFilter = document.getElementById('bookAuthorFilter');
    const categoryFilter = document.getElementById('bookCategoryFilter');
    const statusFilter = document.getElementById('bookStatusFilter');
    
    if (typeFilter && bookFilter.type) typeFilter.value = bookFilter.type;
    if (yearFilter && bookFilter.year) yearFilter.value = bookFilter.year;
    if (ratingFilter && bookFilter.rating) ratingFilter.value = bookFilter.rating;
    if (authorFilter && bookFilter.author) authorFilter.value = bookFilter.author;
    if (categoryFilter && bookFilter.category) categoryFilter.value = bookFilter.category;
    if (statusFilter && bookFilter.readingStatus) statusFilter.value = bookFilter.readingStatus;
    
    // Update filter badge visibility
    const filterBadge = document.getElementById('bookFilterBadge');
    
    if (filterBadge) {
        filterBadge.style.display = hasActiveFilters() ? 'inline-flex' : 'none';
    }
}

// Perform book search via API
async function performBooksSearch(query) {
    const searchResults = document.getElementById('bookSearchResults');
    if (!searchResults) return;
    
    // Show loading indicator
    searchResults.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Пошук книг...</p>
        </div>
    `;
    
    try {
        // Fetch search results using fetchWithCORS
        const data = await API_CONFIG.fetchWithCORS(`books/search/${encodeURIComponent(query)}`);
        
        if (data.results && data.results.length > 0) {
            searchResults.innerHTML = '';
            
            data.results.forEach(item => {
                const resultItem = document.createElement('div');
                resultItem.className = 'book-search-result-item';
                
                // Determine if this book is already in user's collection
                const userRating = getUserRatingForBook(item.id);
                const userStatus = getUserStatusForBook(item.id);
                
                const statusDisplay = userStatus ? 
                    `<div class="book-status-badge">${readingStatusLabels[userStatus]}</div>` : '';
                
                const ratingDisplay = userRating !== null ? 
                    `<div class="book-search-user-rating"><span class="material-icons">star</span> ${userRating}/10</div>` : 
                    '<div class="book-search-add">Додати до колекції ➕</div>';
                
                // Create a placeholder color if no image
                const bgColor = getRandomColor(item.id);
                
                // Format authors list
                const authors = Array.isArray(item.authors) ? item.authors.join(', ') : item.authors || 'Невідомий автор';
                
                // Determine book type icon/emoji
                const typeEmoji = item.type === 'manga' ? '🗯️ Манга' : '📕 Книга';
                
                resultItem.innerHTML = `
                    <div class="book-search-cover" style="background-color: ${bgColor}">
                        ${item.image ? 
                            `<img src="${item.image}" alt="${item.title}" onerror="this.style.display='none'; this.parentNode.innerHTML+='<span class=\\'material-icons\\' style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: rgba(255,255,255,0.7);\\'>menu_book</span>';">` : 
                            `<span class="material-icons" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: rgba(255,255,255,0.7);">
                                menu_book
                            </span>`
                        }
                    </div>
                    <div class="book-search-info">
                        <div class="book-search-title">${item.title}</div>
                        <div class="book-search-details">
                            ${typeEmoji} • ${authors} • ${item.publishedDate || 'Невідома дата'}
                        </div>
                        ${statusDisplay}
                        ${ratingDisplay}
                    </div>
                `;
                
                // Add click handler to show book rating dialog
                resultItem.addEventListener('click', () => {
                    showBookRatingDialog(item);
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
        console.error('❌ Помилка пошуку книг:', error);
        searchResults.innerHTML = `
            <div class="search-error">
                <span class="material-icons">error_outline</span>
                <p>Помилка пошуку. Спробуйте пізніше.</p>
                <button id="retryBookSearchBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retryBookSearchBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                performBooksSearch(query);
            });
        }
    }
}

// Check if user has already rated this book
function getUserRatingForBook(bookId) {
    const ratedBook = booksData.find(book => book.id === bookId);
    return ratedBook ? ratedBook.userRating : null;
}

// Check the user's reading status for this book
function getUserStatusForBook(bookId) {
    const ratedBook = booksData.find(book => book.id === bookId);
    return ratedBook ? ratedBook.readingStatus : null;
}

// Get user's review for this book
function getUserReviewForBook(bookId) {
    const ratedBook = booksData.find(book => book.id === bookId);
    return ratedBook ? ratedBook.userReview : '';
}

// Render books items
function renderBooksItems(items, container) {
    container.innerHTML = ''; // Clear container first
    
    items.forEach(book => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        bookCard.setAttribute('data-id', book.id);
        
        // Create a placeholder color if no image
        const bgColor = getRandomColor(book.id);
        
        // Determine reading status display
        const statusLabel = readingStatusLabels[book.readingStatus] || readingStatusLabels['finished'];
        const statusIcon = readingStatusIcons[book.readingStatus] || 'menu_book';
        
        // Use the image utility for book cover
        const coverImage = book.image ? 
            IMAGE_UTILS.createImageElement(book.image, book.title) : 
            `<span class="material-icons" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 36px; color: rgba(255,255,255,0.7);">
                menu_book
            </span>`;
        
        // Format authors (limit to first 2 for space)
        let authorsText = '';
        if (book.authors && book.authors.length > 0) {
            const displayAuthors = book.authors.slice(0, 2);
            authorsText = displayAuthors.join(', ');
            if (book.authors.length > 2) {
                authorsText += ` +${book.authors.length - 2}`;
            }
        } else {
            authorsText = 'Невідомий автор';
        }
        
        bookCard.innerHTML = `
            <div class="book-cover" style="background-color: ${bgColor}">
                <span class="book-status-badge">
                    <span class="material-icons">${statusIcon}</span>
                </span>
                ${coverImage}
            </div>
            <div class="book-info">
                <div class="book-title">${book.title}</div>
                <div class="book-authors">${authorsText}</div>
                <div class="book-year">${book.publishedDate}</div>
                <div class="book-rating">
                    <span class="material-icons">star</span>
                    ${book.userRating || '-'}/10
                </div>
            </div>
        `;
        
        // Add click handler
        bookCard.addEventListener('click', () => {
            showBookDetails(book);
        });
        
        container.appendChild(bookCard);
        
        // Add staggered fade-in animation
        setTimeout(() => {
            bookCard.style.opacity = '0';
            bookCard.style.transform = 'translateY(20px)';
            bookCard.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            
            setTimeout(() => {
                bookCard.style.opacity = '1';
                bookCard.style.transform = 'translateY(0)';
            }, 10);
        }, 50 * (items.indexOf(book) % 10));
    });
}

// Show book details with options to re-rate, update status, or delete
function showBookDetails(book) {
    // Create a formatted message for the dialog
    let authorText = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors || 'Невідомий автор';
    
    // Format reading status
    const statusText = readingStatusLabels[book.readingStatus] || 'Невідомий статус';
    
    // Show user review if available
    let reviewText = '';
    if (book.userReview && book.userReview.trim()) {
        reviewText = `\n\nВаша рецензія:\n${book.userReview}`;
    }
    
    const detailsMessage = `
Автор: ${authorText}
Видавництво: ${book.publisher}
Рік: ${book.publishedDate}
Сторінок: ${book.pageCount}
Статус: ${statusText}
${book.userRating ? `Ваша оцінка: ⭐ ${book.userRating}/10` : 'Без оцінки'}
${book.notes ? `\nНотатки:\n${book.notes}` : ''}
${reviewText}
    `;
    
    API_CONFIG.showCustomDialog({
        title: book.title,
        message: detailsMessage,
        buttons: [
            {id: 'rate', type: 'default', text: 'Змінити оцінку ✏️'},
            {id: 'status', type: 'default', text: 'Змінити статус 📖'},
            {id: 'delete', type: 'destructive', text: 'Видалити 🗑️'},
            {id: 'close', type: 'cancel', text: 'Закрити ✖️'}
        ]
    }, function(buttonId) {
        if (buttonId === 'rate') {
            showBookRatingDialog(book);
        } else if (buttonId === 'status') {
            showBookStatusDialog(book);
        } else if (buttonId === 'delete') {
            deleteBookRating(book);
        }
    });
}

// Show dialog to rate book and add a review
function showBookRatingDialog(book) {
    const currentRating = getUserRatingForBook(book.id) || 0;
    const currentReview = getUserReviewForBook(book.id) || '';
    
    // First show the rating selection dialog
    const buttons = [];
    for (let i = 10; i >= 1; i--) {
        buttons.push({
            id: `rating_${i}`,
            type: i === currentRating ? 'default' : 'text',
            text: `${i}/10 ${i === currentRating ? '✓' : ''}`
        });
    }
    buttons.push({id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'});
    
    // Format authors for display
    let authorsText = Array.isArray(book.authors) ? book.authors.join(', ') : book.authors || 'Невідомий автор';
    
    // Format book type
    const typeText = book.type === 'manga' ? '🗯️ Манга' : '📕 Книга';
    
    API_CONFIG.showCustomDialog({
        title: `Оцінити: ${book.title}`,
        message: `${typeText} • ${authorsText} • ${book.publishedDate || ''}
        
Виберіть оцінку:`,
        buttons: buttons
    }, function(buttonId) {
        if (buttonId !== 'cancel' && buttonId.startsWith('rating_')) {
            try {
                const rating = parseInt(buttonId.split('_')[1]);
                
                // After selecting rating, show review dialog
                showBookReviewDialog(book, rating, currentReview);
            } catch (error) {
                console.error('Помилка обробки оцінки:', error);
                API_CONFIG.showToast('Помилка додавання оцінки ❌');
            }
        }
    });
}

// Show dialog to enter book review
function showBookReviewDialog(book, rating, currentReview) {
    // Create a dialog with textarea for review
    const reviewDialog = document.createElement('div');
    reviewDialog.className = 'custom-dialog-overlay active';
    
    reviewDialog.innerHTML = `
        <div class="custom-dialog">
            <div class="custom-dialog-title">Додати рецензію</div>
            <div class="custom-dialog-message">
                <p>Ваша оцінка: ${rating}/10 ⭐</p>
                <p>Залиште свою рецензію (необов'язково):</p>
                <textarea id="bookReviewText" rows="6" style="width: 100%; margin-top: 10px; padding: 8px; background-color: var(--surface); color: var(--text); border: 1px solid var(--muted); border-radius: var(--border-radius);">${currentReview}</textarea>
            </div>
            <div class="custom-dialog-buttons">
                <button id="saveReviewBtn" class="custom-dialog-button primary">Зберегти</button>
                <button id="skipReviewBtn" class="custom-dialog-button">Без рецензії</button>
                <button id="cancelReviewBtn" class="custom-dialog-button">Скасувати</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(reviewDialog);
    
    // Focus the textarea
    setTimeout(() => {
        const textarea = document.getElementById('bookReviewText');
        if (textarea) textarea.focus();
    }, 100);
    
    // Handle buttons
    document.getElementById('saveReviewBtn').addEventListener('click', () => {
        const reviewText = document.getElementById('bookReviewText').value;
        document.body.removeChild(reviewDialog);
        addOrUpdateBookRating(book, rating, book.readingStatus || 'finished', reviewText);
    });
    
    document.getElementById('skipReviewBtn').addEventListener('click', () => {
        document.body.removeChild(reviewDialog);
        addOrUpdateBookRating(book, rating, book.readingStatus || 'finished', '');
    });
    
    document.getElementById('cancelReviewBtn').addEventListener('click', () => {
        document.body.removeChild(reviewDialog);
    });
    
    // Close when clicking outside
    reviewDialog.addEventListener('click', (e) => {
        if (e.target === reviewDialog) {
            document.body.removeChild(reviewDialog);
        }
    });
}

// Show dialog to update book reading status
function showBookStatusDialog(book) {
    const currentStatus = book.readingStatus || 'finished';
    
    API_CONFIG.showCustomDialog({
        title: `Статус читання`,
        message: `${book.title}\n\nВиберіть статус читання:`,
        buttons: [
            {id: 'reading', type: currentStatus === 'reading' ? 'default' : 'text', text: '📖 Читаю зараз'},
            {id: 'to-read', type: currentStatus === 'to-read' ? 'default' : 'text', text: '📚 Планую прочитати'},
            {id: 'finished', type: currentStatus === 'finished' ? 'default' : 'text', text: '✓ Прочитано'},
            {id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'}
        ]
    }, function(buttonId) {
        if (buttonId !== 'cancel' && ['reading', 'to-read', 'finished'].includes(buttonId)) {
            updateBookStatus(book, buttonId);
        }
    });
}

// Add or update book rating with review
async function addOrUpdateBookRating(book, rating, status, review) {
    // Show loading indicator
    API_CONFIG.showToast('Зберігаємо оцінку...');
    
    try {
        // Create request body
        const requestBody = {
            userId: getCurrentUserId(),
            bookId: book.id,
            rating: rating,
            readingStatus: status,
            review: review
        };
        
        // If book has notes, include them
        if (book.notes) {
            requestBody.notes = book.notes;
        }
        
        console.log(`📚 Додавання оцінки для книги: ${book.id}, оцінка: ${rating}, статус: ${status}`);
        
        // Call API to add/update rating
        const data = await API_CONFIG.fetchWithCORS('books/rate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (data.success) {
            // Update local data if needed
            const existingIndex = booksData.findIndex(b => b.id === book.id);
            if (existingIndex >= 0) {
                // Update existing book
                booksData[existingIndex].userRating = rating;
                booksData[existingIndex].readingStatus = status;
                booksData[existingIndex].userReview = review;
            } else {
                // Add new book to the beginning of the array
                booksData.unshift({
                    ...book,
                    userRating: rating,
                    readingStatus: status,
                    userReview: review
                });
            }
            
            // Reload the collection to show updated ratings
            loadBooksCollection();
            
            // Show success message
            API_CONFIG.showToast('Збережено! ✅');
        } else {
            throw new Error(data.error || 'Невідома помилка');
        }
    } catch (error) {
        console.error('❌ Помилка оцінки:', error);
        API_CONFIG.showToast(`Помилка збереження: ${error.message} ❌`);
    }
}

// Update book reading status
async function updateBookStatus(book, newStatus) {
    // Show loading indicator
    API_CONFIG.showToast('Оновлюємо статус...');
    
    try {
        // Create request body
        const requestBody = {
            readingStatus: newStatus
        };
        
        console.log(`📚 Оновлення статусу книги: ${book.id}, новий статус: ${newStatus}`);
        
        // Call API to update status
        const data = await API_CONFIG.fetchWithCORS(`books/status/${getCurrentUserId()}/${book.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (data.success) {
            // Update local data
            const existingIndex = booksData.findIndex(b => b.id === book.id);
            if (existingIndex >= 0) {
                booksData[existingIndex].readingStatus = newStatus;
            }
            
            // Reload the collection
            loadBooksCollection();
            
            // Show success message
            API_CONFIG.showToast('Статус оновлено! ✅');
        } else {
            throw new Error(data.error || 'Невідома помилка');
        }
    } catch (error) {
        console.error('❌ Помилка оновлення статусу:', error);
        API_CONFIG.showToast(`Помилка: ${error.message} ❌`);
    }
}

// Delete book rating
function deleteBookRating(book) {
    // Ask for confirmation
    API_CONFIG.showCustomDialog({
        title: 'Видалення книги',
        message: `Ви впевнені, що хочете видалити "${book.title}" з вашої колекції?`,
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
                const data = await API_CONFIG.fetchWithCORS(`books/remove/${getCurrentUserId()}/${book.id}`, {
                    method: 'DELETE'
                });
                
                if (data.success) {
                    // Remove book from local data
                    booksData = booksData.filter(b => b.id !== book.id);
                    
                    // Reload the collection
                    loadBooksCollection();
                    
                    // Show success message
                    API_CONFIG.showToast('Книгу видалено! ✅');
                } else {
                    throw new Error(data.error || 'Невідома помилка');
                }
            } catch (error) {
                console.error('❌ Помилка видалення:', error);
                API_CONFIG.showToast('Помилка видалення книги ❌');
            }
        }
    });
}

// Generate random color based on seed
function getRandomColor(seed) {
    // Generate a deterministic color based on seed
    const hue = (String(seed).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 360);
    return `hsl(${hue}, 70%, 35%)`;
}