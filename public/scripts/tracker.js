// Трекер товарів - Розширена версія з підтримкою Steam, Rozetka та Comfy
let trackedItems = [];

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

// Ініціалізація відстеження товарів - використовуємо DOMContentLoaded з одноразовим викликом
document.addEventListener('DOMContentLoaded', initializeTracker);

function initializeTracker() {
    debugAPI("Ініціалізація трекера почалась");
    
    // Отримати ID користувача з Telegram WebApp, якщо доступний
    
    // Налаштовуємо трекер і фільтри після короткої затримки для завершення рендерингу DOM
    setTimeout(() => {
        setupTrackerHandlers();
        setupTrackerFilters();
        debugAPI("Ініціалізація трекера завершена");
    }, 200);
}

// Спрощене налаштування обробників трекера
function setupTrackerHandlers() {
    const trackerInput = document.getElementById('trackerInput');
    const addTrackerBtn = document.getElementById('addTrackerBtn');
    
    debugAPI(`Пошук елементів трекера: 
    - Input елемент: ${trackerInput ? 'знайдено' : 'НЕ ЗНАЙДЕНО!'}
    - Кнопка додавання: ${addTrackerBtn ? 'знайдено' : 'НЕ ЗНАЙДЕНО!'}`);
    
    if (!trackerInput) {
        debugAPI("⚠️ КРИТИЧНА ПОМИЛКА: Елемент вводу URL #trackerInput не знайдено!");
        return;
    }
    
    if (!addTrackerBtn) {
        debugAPI("⚠️ КРИТИЧНА ПОМИЛКА: Кнопка додавання #addTrackerBtn не знайдено!");
        return;
    }
    
    // Використовуємо пряме призначення обробників подій з вбудованими функціями
    addTrackerBtn.onclick = function(e) {
        e.preventDefault();
        debugAPI("Натиснуто кнопку додавання");
        handleAddItemAction();
    };
    
    trackerInput.onkeyup = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            debugAPI("Натиснуто Enter в полі вводу");
            handleAddItemAction();
        }
    };
    
    debugAPI("✅ Обробники подій трекера успішно налаштовані");
}

// Централізована функція для додавання товару
function handleAddItemAction() {
    const trackerInput = document.getElementById('trackerInput');
    if (!trackerInput) {
        debugAPI("⚠️ Поле вводу не знайдено при спробі додати товар");
        API_CONFIG.showToast("Помилка: поле вводу не знайдено");
        return;
    }
    
    const url = trackerInput.value?.trim();
    debugAPI(`Спроба додати товар з URL: ${url}`);
    
    // Проста валідація URL
    if (!url) {
        API_CONFIG.showToast("Будь ласка, введіть URL товару");
        return;
    }
    
    addTrackedItem(url);
}

// Завантаження відстежуваних товарів
function loadTrackerItems() {
    debugAPI("loadTrackerItems викликана");
    fetchTrackedItems();
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

// Отримання відстежуваних товарів з API - спрощений і більш надійний підхід
async function fetchTrackedItems() {
    const trackedItemsContainer = document.getElementById('trackedItems');
    if (!trackedItemsContainer) {
        debugAPI("Контейнер #trackedItems не знайдено");
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
        debugAPI(`Запит товарів для користувача ${currentUserId}`);
        
        // Використовуємо спрощений підхід без додаткових обгорток
        const response = await fetch(`/api/tracker/${currentUserId}`);
        
        if (!response.ok) {
            throw new Error(`Сервер повернув помилку: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        debugAPI(`Отримано ${Array.isArray(data) ? data.length : '0'} товарів з API`);
        
        // Зберігаємо отримані дані
        trackedItems = Array.isArray(data) ? data : [];
        
        // Застосувати фільтри та сортування
        applyFiltersAndSort();
    } catch (error) {
        debugAPI(`Помилка завантаження: ${error.message}`);
        trackedItemsContainer.innerHTML = `
            <div class="tracker-error">
                <span class="material-icons">error_outline</span>
                <p>Не вдалося завантажити відстежувані товари</p>
                <p class="error-details">${error.message}</p>
                <button id="retryTrackerBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Додати функціональність кнопки повторного завантаження
        const retryBtn = document.getElementById('retryTrackerBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', fetchTrackedItems);
        }
    }
}

// Додати новий відстежуваний товар - спрощена і більш надійна версія
async function addTrackedItem(url) {
    if (!url) return;
    
    // Перевірка URL
    if (!isValidURL(url)) {
        API_CONFIG.showToast('Введіть коректний URL товару ⚠️');
        return;
    }
    
    // Перевірка підтримки платформи
    const platform = getPlatformFromURL(url);
    if (!platform) {
        API_CONFIG.showToast('Підтримуються тільки товари Steam, Rozetka та Comfy 🛒');
        return;
    }
    
    // Показати стан завантаження
    const addTrackerBtn = document.getElementById('addTrackerBtn');
    if (addTrackerBtn) {
        addTrackerBtn.disabled = true;
        addTrackerBtn.innerHTML = '<span class="material-icons rotating">refresh</span>';
    }
    
    try {
        // Підготовка даних запиту
        const requestBody = JSON.stringify({
            userId: currentUserId,
            url: url
        });
        
        debugAPI(`Додавання товару: ${url}`);
        
        // Використовуємо fetch напряму з правильними заголовками
        const response = await fetch('/api/tracker/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: requestBody
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Помилка сервера: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Очистити поле вводу
        const trackerInput = document.getElementById('trackerInput');
        if (trackerInput) trackerInput.value = '';
        
        // Перевірка, чи товар вже на розпродажі
        if (data.alreadyOnSale) {
            showSaleItemDialog(data, url);
        } else {
            // Додавання товару до списку
            if (data._id) {
                trackedItems.push(data);
                applyFiltersAndSort();
                API_CONFIG.showToast('Товар додано до відстеження ✅');
            }
        }
    } catch (error) {
        debugAPI(`Помилка додавання: ${error.message}`);
        API_CONFIG.showToast(`Помилка: ${error.message}`);
    } finally {
        // Відновити стан кнопки
        const addTrackerBtn = document.getElementById('addTrackerBtn');
        if (addTrackerBtn) {
            addTrackerBtn.disabled = false;
            addTrackerBtn.innerHTML = '<span class="material-icons">add</span>';
        }
    }
}

// Показати діалог для товару на розпродажі
function showSaleItemDialog(data, url) {
    const details = data.saleDetails;
    const platform = getPlatformFromURL(url);
    const currency = getPlatformCurrency(platform);
    
    API_CONFIG.showCustomDialog({
        title: '💸 Товар вже на розпродажі!',
        message: `"${details.productName}" вже у знижці!
        
Початкова ціна: ${details.originalPrice} ${currency}
Ціна зі знижкою: ${details.salePrice} ${currency}
Знижка: ${details.salePercent}%`,
        buttons: [
            {id: 'add', type: 'default', text: 'Все одно відстежувати 🔍'},
            {id: 'cancel', type: 'cancel', text: 'Скасувати ✖️'},
        ]
    }, function(buttonId) {
        if (buttonId === 'add') {
            addItemThatIsAlreadyOnSale(url);
        }
    });
}

// Додати товар, який вже на розпродажі
async function addItemThatIsAlreadyOnSale(url) {
    try {
        API_CONFIG.showToast('Додаємо товар...');
        
        const response = await fetch('/api/tracker/add/force', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUserId,
                url: url
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Помилка сервера');
        }
        
        const data = await response.json();
        
        trackedItems.push(data);
        applyFiltersAndSort();
        API_CONFIG.showToast('Товар додано до відстеження ✅');
    } catch (error) {
        debugAPI(`Помилка: ${error.message}`);
        API_CONFIG.showToast(`Помилка: ${error.message}`);
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

// Видалити відстежуваний товар - оновлена версія
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
            API_CONFIG.showToast('Видаляємо...');
            
            try {
                const response = await fetch(`/api/tracker/remove/${currentUserId}/${itemId}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Помилка видалення');
                }
                
                const data = await response.json();
                
                if (data.success) {
                    // Видалити товар з локальних даних
                    trackedItems = trackedItems.filter(item => {
                        const currentId = item.id || item._id || item.productId;
                        return currentId !== itemId;
                    });
                    
                    applyFiltersAndSort();
                    API_CONFIG.showToast('Товар видалено з відстеження ✅');
                }
            } catch (error) {
                debugAPI(`Помилка видалення: ${error.message}`);
                API_CONFIG.showToast('Помилка видалення товару ❌');
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