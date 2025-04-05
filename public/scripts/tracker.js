// Трекер товарів - Розширена версія з підтримкою Steam, Rozetka та Comfy
let trackedItems = [];
let currentUserId = '594235906'; // Буде встановлено зі сторони Telegram WebApp

function debugAPI(message) {
    console.log(`🔍 [Трекер Налагодження] ${message}`);
}

// Стан фільтрації та сортування трекера
let trackerFilters = {
    platform: 'all',
    sale: false
};

let trackerSort = {
    field: 'dateAdded',
    order: 'desc'
};

// Ініціалізація відстеження товарів
document.addEventListener('DOMContentLoaded', function() {
    // Отримати ID користувача з Telegram WebApp, якщо доступний
    if (telegram.initDataUnsafe && telegram.initDataUnsafe.user) {
        currentUserId = telegram.initDataUnsafe.user.id.toString();
    }
    
    setupTracker();
    setupTrackerFilters();
});

// Завантаження відстежуваних товарів
function loadTrackerItems() {
    debugAPI("loadTrackerItems викликана");
    fetchTrackedItems();
}

// Налаштування трекера
function setupTracker() {
    const trackerInput = document.getElementById('trackerInput');
    const addTrackerBtn = document.getElementById('addTrackerBtn');
    
    if (!trackerInput || !addTrackerBtn) return;
    
    // Додавання нового товару по кліку на кнопку
    addTrackerBtn.addEventListener('click', () => {
        addTrackedItem();
    });
    
    // Додавання нового товару при натисканні Enter
    trackerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTrackedItem();
        }
    });
}

// Налаштування фільтрів трекера
function setupTrackerFilters() {
    // Знайти всі кнопки фільтрації
    const filterButtons = document.querySelectorAll('.tracker-filter-btn');
    const sortSelect = document.getElementById('trackerSort');
    
    if (!filterButtons.length || !sortSelect) return;
    
    // Додати обробники подій до кнопок фільтра
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const filterType = button.getAttribute('data-filter');
            
            // Обробка фільтрів платформи (all, steam, rozetka, comfy)
            if (['all', 'steam', 'rozetka', 'comfy'].includes(filterType)) {
                // Видалити активний клас з усіх кнопок у цій групі
                button.parentNode.querySelectorAll('.tracker-filter-btn').forEach(btn => {
                    if (['all', 'steam', 'rozetka', 'comfy'].includes(btn.getAttribute('data-filter'))) {
                        btn.classList.remove('active');
                    }
                });
                
                // Додати активний клас до натиснутої кнопки
                button.classList.add('active');
                
                // Оновити фільтр платформи
                trackerFilters.platform = filterType;
            }
            
            // Обробка фільтра знижок
            if (filterType === 'sale') {
                // Переключити активний клас
                button.classList.toggle('active');
                
                // Оновити фільтр знижок
                trackerFilters.sale = button.classList.contains('active');
            }
            
            // Застосувати фільтри та оновити відображення
            applyFiltersAndSort();
        });
    });
    
    // Додати обробник події зміни сортування
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const [field, order] = sortSelect.value.split('_');
            
            // Оновити параметри сортування
            trackerSort.field = field;
            trackerSort.order = order;
            
            // Застосувати сортування
            applyFiltersAndSort();
        });
    }
}

// Застосувати фільтри та сортування до списку товарів
function applyFiltersAndSort() {
    // Спочатку фільтруємо товари
    let filteredItems = [...trackedItems];
    
    // Фільтрація за платформою
    if (trackerFilters.platform !== 'all') {
        filteredItems = filteredItems.filter(item => 
            item.platform === trackerFilters.platform
        );
    }
    
    // Фільтрація за наявністю знижки
    if (trackerFilters.sale) {
        filteredItems = filteredItems.filter(item => 
            item.status === 'sale'
        );
    }
    
    // Потім сортуємо відфільтровані товари
    filteredItems.sort((a, b) => {
        // Обрати поля для порівняння залежно від налаштувань сортування
        let aValue, bValue;
        
        // Визначення поля для сортування
        switch (trackerSort.field) {
            case 'dateAdded':
                aValue = new Date(a.dateAdded || a.updatedAt || 0);
                bValue = new Date(b.dateAdded || b.updatedAt || 0);
                break;
            case 'price':
                // Використовуємо ціну зі знижкою, якщо товар на розпродажі
                aValue = a.status === 'sale' ? (a.salePrice || 0) : (a.price || 0);
                bValue = b.status === 'sale' ? (b.salePrice || 0) : (b.price || 0);
                break;
            case 'salePercent':
                aValue = a.salePercent || 0;
                bValue = b.salePercent || 0;
                break;
            default:
                aValue = a[trackerSort.field] || 0;
                bValue = b[trackerSort.field] || 0;
        }
        
        // Визначення порядку сортування
        const sortOrder = trackerSort.order === 'asc' ? 1 : -1;
        
        // Порівняння та сортування
        if (aValue < bValue) return -1 * sortOrder;
        if (aValue > bValue) return 1 * sortOrder;
        return 0;
    });
    
    // Оновлення відображення відфільтрованих та відсортованих товарів
    renderFilteredItems(filteredItems);
}

// Відображення відфільтрованих товарів
function renderFilteredItems(items) {
    const trackedItemsContainer = document.getElementById('trackedItems');
    if (!trackedItemsContainer) return;
    
    if (items.length === 0) {
        // Перевірити, чи є товари в основному списку, але вони були відфільтровані
        if (trackedItems.length > 0) {
            trackedItemsContainer.innerHTML = '<p class="no-items-message">Немає товарів, що відповідають фільтрам 🔍</p>';
        } else {
            trackedItemsContainer.innerHTML = '<p class="no-items-message">Немає відстежуваних товарів 🛒</p>';
        }
        return;
    }
    
    // Очистити контейнер
    trackedItemsContainer.innerHTML = '';
    
    // Відобразити відфільтровані товари
    items.forEach((item, index) => {
        renderTrackedItem(item, index, trackedItemsContainer);
    });
    
    // Додати обробники подій
    addTrackedItemEventListeners();
}

// Отримання відстежуваних товарів з API
async function fetchTrackedItems() {
    const trackedItemsContainer = document.getElementById('trackedItems');
    if (!trackedItemsContainer) {
        debugAPI("Контейнер trackedItems не знайдено");
        return;
    }
    
    // Показати індикатор завантаження
    trackedItemsContainer.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Завантаження відстежуваних товарів...</p>
        </div>
    `;
    
    try {
        // Повний URL API для зрозумілого налагодження
        const apiUrl = API_CONFIG.getApiUrl(`tracker/${currentUserId}`);
        debugAPI(`Виконуємо запит: GET ${apiUrl}`);
        
        // Запит відстежуваних товарів з API
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Отримання відстежуваних товарів з API
        const data = await response.json();
        debugAPI(`Отримано ${data.length} товарів з API`);
        
        // Зберігаємо отримані дані
        trackedItems = Array.isArray(data) ? data : [];
        
        // Застосувати фільтри та сортування за замовчуванням
        applyFiltersAndSort();
    } catch (error) {
        debugAPI(`Помилка завантаження: ${error.message}`);
        console.error('Помилка завантаження відстежуваних товарів:', error);
        trackedItemsContainer.innerHTML = `
            <div class="tracker-error">
                <span class="material-icons">error_outline</span>
                <p>Не вдалося завантажити відстежувані товари 😢</p>
                <p class="error-details">${error.message}</p>
                <button id="retryTrackerBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Додати функціональність кнопки повторного завантаження
        const retryBtn = document.getElementById('retryTrackerBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                fetchTrackedItems();
            });
        }
    }
}

// Додати новий відстежуваний товар
async function addTrackedItem() {
    const trackerInput = document.getElementById('trackerInput');
    const addTrackerBtn = document.getElementById('addTrackerBtn');
    
    if (!trackerInput || trackerInput.value.trim() === '') {
        debugAPI("Поле вводу порожнє або не знайдено");
        return;
    }
    
    const url = trackerInput.value.trim();
    debugAPI(`Додавання URL: ${url}`);
    
    // Перевірка формату URL
    if (!isValidURL(url)) {
        API_CONFIG.showToast('Введіть коректний URL товару ⚠️');
        debugAPI("Некоректний URL формат");
        return;
    }
    
    // Перевірка, чи URL належить підтримуваній платформі
    const platform = getPlatformFromURL(url);
    if (!platform) {
        API_CONFIG.showToast('Підтримуються тільки товари Steam, Rozetka та Comfy 🛒');
        debugAPI("Непідтримувана платформа");
        return;
    }
    
    // Показати стан завантаження
    addTrackerBtn.disabled = true;
    addTrackerBtn.innerHTML = '<span class="material-icons rotating">refresh</span>';
    debugAPI("Починаємо запит до API");
    
    try {
        // Сформувати повний URL для API
        const apiUrl = API_CONFIG.getApiUrl(`tracker/add`);
        debugAPI(`Виконуємо запит: POST ${apiUrl}`);
        
        // Виклик API для додавання відстежуваного товару
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUserId,
                url: url
            })
        });
        
        const responseText = await response.text();
        debugAPI(`Відповідь API (текст): ${responseText}`);
        
        let data;
        try {
            // Спробувати розпарсити як JSON
            data = JSON.parse(responseText);
        } catch (jsonError) {
            debugAPI(`Помилка парсингу JSON: ${jsonError.message}`);
            throw new Error(`Неправильний формат відповіді: ${responseText}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Помилка HTTP: ${response.status}`);
        }
        
        debugAPI(`Успішна відповідь від API: ${JSON.stringify(data)}`);
        
        // Перевірка, чи товар вже на розпродажі
        if (data.alreadyOnSale) {
            // Показати діалог з інформацією про розпродаж
            API_CONFIG.showCustomDialog({
                title: '💸 Товар вже на розпродажі!',
                message: `"${data.saleDetails.productName}" вже у знижці!
                
Початкова ціна: ${data.saleDetails.originalPrice} ${getPlatformCurrency(platform)}
Ціна зі знижкою: ${data.saleDetails.salePrice} ${getPlatformCurrency(platform)}
Знижка: ${data.saleDetails.salePercent}%`,
                buttons: [
                    {id: 'add', type: 'default', text: 'Все одно відстежувати 🔍'},
                    {id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'},
                ]
            }, function(buttonId) {
                if (buttonId === 'add') {
                    addItemThatIsAlreadyOnSale(url);
                }
                trackerInput.value = '';
            });
        } else if (data.success || data._id) {
            // Додати новий товар до відстежуваних
            if (data.item) {
                trackedItems.push(data.item);
            } else {
                // Якщо API повертає товар у іншому форматі
                trackedItems.push(data);
            }
            
            // Очистити поле вводу
            trackerInput.value = '';
            
            // Застосувати фільтри та сортування
            applyFiltersAndSort();
            
            // Показати повідомлення про успіх
            API_CONFIG.showToast('Товар додано до відстеження ✅');
            debugAPI("Товар успішно додано");
        } else {
            throw new Error(data.error || 'Невідома помилка відповіді API');
        }
    } catch (error) {
        debugAPI(`Помилка додавання: ${error.message}`);
        console.error('Помилка додавання відстежуваного товару:', error);
        
        if (error.message.includes('Unsupported website')) {
            API_CONFIG.showToast('Вибачте, відстежуються тільки Steam, Comfy та Rozetka ⚠️');
        } else {
            API_CONFIG.showToast(error.message || 'Помилка додавання товару ❌');
        }
    } finally {
        // Відновити стан кнопки
        addTrackerBtn.disabled = false;
        addTrackerBtn.innerHTML = '<span class="material-icons">add</span>';
        debugAPI("Стан кнопки відновлено");
    }
}

// Додати товар, який вже на розпродажі
async function addItemThatIsAlreadyOnSale(url) {
    try {
        // Показати спінер завантаження
        API_CONFIG.showToast('Додаємо товар...');
        
        const response = await fetch(API_CONFIG.getApiUrl(`tracker/add/force`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: currentUserId,
                url: url
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Не вдалося додати товар для відстеження');
        }
        
        const data = await response.json();
        
        // Додати новий товар до відстежуваних
        trackedItems.push(data);
        
        // Застосувати фільтри та сортування
        applyFiltersAndSort();
        
        // Показати повідомлення про успіх
        API_CONFIG.showToast('Товар додано до відстеження ✅');
    } catch (error) {
        console.error('Помилка додавання товару:', error);
        API_CONFIG.showToast(error.message || 'Помилка додавання товару ❌');
    }
}

// Відображення відстежуваних товарів
function renderTrackedItems() {
    // Застосувати поточні фільтри та сортування
    applyFiltersAndSort();
}

// Відображення окремого відстежуваного товару
function renderTrackedItem(item, index, container) {
    const itemElement = document.createElement('div');
    itemElement.className = 'tracked-item';
    
    // Використовуємо або id товару, або _id з MongoDB
    const itemId = item.id || item._id || item.productId;
    itemElement.setAttribute('data-id', itemId);
    
    // Створити індикатор зміни ціни
    let priceChangeIndicator = '';
    
    if (item.status === 'sale') {
        // Товар на розпродажі - показати поточну знижку
        const changeClass = 'positive';
        const changeIcon = 'arrow_downward';
        
        // Розрахунок суми економії
        const savedAmount = item.price - item.salePrice;
        
        priceChangeIndicator = `
            <span class="price-change ${changeClass}">
                <span class="material-icons">${changeIcon}</span>
                -${item.salePercent}% (-${savedAmount.toFixed(2)} ${item.currency || getPlatformCurrency(item.platform)})
            </span>
        `;
    } else if (item.priceChange && item.priceChange !== 0) {
        // Зміна ціни для товарів, які не на розпродажі
        const changeClass = item.priceChange > 0 ? 'negative' : 'positive';
        const changeIcon = item.priceChange > 0 ? 'arrow_upward' : 'arrow_downward';
        const changeAmount = Math.abs(item.priceChange).toFixed(2);
        
        priceChangeIndicator = `
            <span class="price-change ${changeClass}">
                <span class="material-icons">${changeIcon}</span>
                ${changeAmount} ${item.currency || getPlatformCurrency(item.platform)}
            </span>
        `;
    }
    
    // Визначити іконку платформи
    const platformIcon = getPlatformIcon(item.platform);
    
    // Створити колір фону на основі ID товару
    const bgColor = getRandomColor(itemId);
    
    // Визначити назву товару: використовуємо або productName, або title
    const productName = item.productName || item.title || 'Невідомий товар';
    
    // Визначити ціну для відображення
    let displayPrice = '';
    if (item.status === 'sale') {
        displayPrice = `${item.salePrice} ${item.currency || getPlatformCurrency(item.platform)}`;
    } else {
        displayPrice = `${item.price || 0} ${item.currency || getPlatformCurrency(item.platform)}`;
    }
    
    // Додати бейдж статусу, якщо товар на розпродажі або безкоштовний
    let statusBadge = '';
    if (item.status === 'sale') {
        statusBadge = `<div class="tracked-item-status sale">-${item.salePercent}%</div>`;
    } else if (item.status === 'free') {
        statusBadge = '<div class="tracked-item-status free">Безкоштовно</div>';
    }
    
    // Створити елемент товару
    itemElement.innerHTML = `
        ${statusBadge}
        <div class="tracked-item-image" style="background-color: ${bgColor}">
            <span class="material-icons" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: rgba(255,255,255,0.7);">
                ${platformIcon}
            </span>
        </div>
        <div class="tracked-item-info">
            <div class="tracked-item-title">${productName}</div>
            <div class="tracked-item-price">
                ${displayPrice}
                ${priceChangeIndicator}
            </div>
            <div class="tracked-item-details">
                <span class="tracked-item-category">
                    <span class="material-icons">category</span>
                    ${item.category || getPlatformName(item.platform)}
                </span>
                <span>
                    <span class="material-icons">update</span>
                    ${formatTimeAgo(item.dateAdded || item.updatedAt)}
                </span>
            </div>
        </div>
        <button class="tracked-item-remove" data-id="${itemId}">
            <span class="material-icons">delete</span>
        </button>
    `;
    
    // Додати елемент до контейнера
    container.appendChild(itemElement);
    
    // Додати анімацію появи
    setTimeout(() => {
        itemElement.style.opacity = '0';
        itemElement.style.transform = 'translateX(-20px)';
        itemElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        
        setTimeout(() => {
            itemElement.style.opacity = '1';
            itemElement.style.transform = 'translateX(0)';
        }, 10);
    }, 50 * index);
}

// Додавання обробників подій для елементів товарів
function addTrackedItemEventListeners() {
    const trackedItemsContainer = document.getElementById('trackedItems');
    if (!trackedItemsContainer) return;
    
    // Додати обробники подій до кнопок видалення
    const removeButtons = trackedItemsContainer.querySelectorAll('.tracked-item-remove');
    removeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = button.getAttribute('data-id');
            removeTrackedItem(itemId);
        });
    });
    
    // Додати обробник кліку на елементи
    const itemElements = trackedItemsContainer.querySelectorAll('.tracked-item');
    itemElements.forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            const trackedItem = trackedItems.find(i => (i.id === id || i._id === id || i.productId === id));
            if (trackedItem) {
                showItemDetails(trackedItem);
            }
        });
    });
}

// Показати деталі товару
function showItemDetails(item) {
    // Використовуємо productName або title
    const productName = item.productName || item.title || 'Невідомий товар';
    
    // Визначаємо відповідну валюту
    const currency = item.currency || getPlatformCurrency(item.platform);
    
    let statusMessage = '';
    let priceMessage = '';
    
    if (item.status === 'sale') {
        statusMessage = `Знижка: ${item.salePercent}%`;
        priceMessage = `Звичайна ціна: ${item.price} ${currency}
Ціна зі знижкою: ${item.salePrice} ${currency}`;
    } else {
        priceMessage = `Поточна ціна: ${item.price} ${currency}`;
        if (item.priceChange && item.priceChange !== 0) {
            statusMessage = `Зміна ціни: ${item.priceChange > 0 ? '+' : ''}${item.priceChange} ${currency}`;
        }
    }
    
    // Додати категорію товару, якщо доступна
    const categoryInfo = item.category ? `Категорія: ${item.category}` : '';
    
    API_CONFIG.showCustomDialog({
        title: productName,
        message: `
${categoryInfo}
${priceMessage}
${statusMessage}
Платформа: ${getPlatformName(item.platform)}
Додано: ${formatDate(item.dateAdded || item.updatedAt)}
URL: ${item.url}
        `,
        buttons: [
            {id: 'visit', type: 'default', text: 'Відкрити URL 🌐'},
            {id: 'delete', type: 'destructive', text: 'Видалити 🗑️'},
            {id: 'close', type: 'cancel', text: 'Закрити ✖️'}
        ]
    }, function(buttonId) {
        if (buttonId === 'visit') {
            window.open(item.url, '_blank');
        } else if (buttonId === 'delete') {
            const itemId = item.id || item._id || item.productId;
            removeTrackedItem(itemId);
        }
    });
}

// Видалити відстежуваний товар
async function removeTrackedItem(itemId) {
    API_CONFIG.showCustomDialog({
        title: 'Видалення товару',
        message: 'Ви впевнені, що хочете видалити цей товар з відстеження?',
        buttons: [
            {id: 'delete', type: 'destructive', text: 'Видалити 🗑️'},
            {id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'}
        ]
    }, async function(buttonId) {
        if (buttonId === 'delete') {
            // Показати індикатор завантаження
            API_CONFIG.showToast('Видаляємо...');
            
            try {
                // Виклик API для видалення відстежуваного товару
                const response = await fetch(API_CONFIG.getApiUrl(`tracker/remove/${currentUserId}/${itemId}`), {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Не вдалося видалити відстежуваний товар');
                }
                
                const data = await response.json();
                
                if (data.success) {
                    // Видалити товар з локальних даних
                    trackedItems = trackedItems.filter(item => {
                        // Перевірити всі можливі ID формати
                        const currentId = item.id || item._id || item.productId;
                        return currentId !== itemId;
                    });
                    
                    // Застосувати фільтри та сортування
                    applyFiltersAndSort();
                    
                    // Показати підтвердження
                    API_CONFIG.showToast('Товар видалено з відстеження ✅');
                } else {
                    throw new Error(data.error || 'Невідома помилка');
                }
            } catch (error) {
                console.error('Помилка видалення відстежуваного товару:', error);
                API_CONFIG.showToast(error.message || 'Помилка видалення товару ❌');
            }
        }
    });
}

// Допоміжні функції
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function getPlatformFromURL(url) {
    if (url.includes('store.steampowered.com') || url.includes('steamcommunity.com')) {
        return 'steam';
    } else if (url.includes('rozetka.com.ua')) {
        return 'rozetka';
    } else if (url.includes('comfy.ua')) {
        return 'comfy';
    }
    return null;
}

function getPlatformName(platform) {
    switch (platform?.toLowerCase()) {
        case 'steam':
            return 'Steam';
        case 'rozetka':
            return 'Rozetka';
        case 'comfy':
            return 'Comfy';
        default:
            return 'Невідомо';
    }
}

function getPlatformIcon(platform) {
    switch (platform?.toLowerCase()) {
        case 'steam':
            return 'sports_esports';
        case 'rozetka':
        case 'comfy':
            return 'shopping_cart';
        default:
            return 'shopping_bag';
    }
}

function getPlatformCurrency(platform) {
    switch (platform?.toLowerCase()) {
        case 'steam':
            return '₴';
        case 'rozetka':
        case 'comfy':
            return '₴';
        default:
            return '₴';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Невідомо';
    
    const date = new Date(dateString);
    
    // Перевірити чи дата валідна
    if (isNaN(date.getTime())) return 'Невідомо';
    
    return new Intl.DateTimeFormat('uk-UA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatTimeAgo(dateString) {
    if (!dateString) return 'Невідомо';
    
    const date = new Date(dateString);
    
    // Перевірити чи дата валідна
    if (isNaN(date.getTime())) return 'Невідомо';
    
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffDays > 30) {
        const diffMonths = Math.floor(diffDays / 30);
        return `${diffMonths} міс. тому`;
    } else if (diffDays > 0) {
        return `${diffDays} д. тому`;
    } else if (diffHours > 0) {
        return `${diffHours} год. тому`;
    } else if (diffMinutes > 0) {
        return `${diffMinutes} хв. тому`;
    } else {
        return 'Щойно';
    }
}

// Генерувати випадковий колір на основі seed
function getRandomColor(seed) {
    // Генерувати детермінований колір на основі seed
    const hue = (String(seed).split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 360);
    return `hsl(${hue}, 70%, 35%)`;
}