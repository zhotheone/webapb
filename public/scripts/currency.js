// Currency Module
let exchangeRates = {};
const BASE_CURRENCY = 'UAH';

// Initialize currency module
document.addEventListener('DOMContentLoaded', function() {
    setupCurrencyConverter();
});

// Load currency data
function loadCurrencyData() {
    fetchExchangeRates();
}

// Setup currency converter
function setupCurrencyConverter() {
    const currencyAmount = document.getElementById('currencyAmount');
    const currencyFrom = document.getElementById('currencyFrom');
    const currencyTo = document.getElementById('currencyTo');
    const currencyResult = document.getElementById('currencyResult');
    const currencySwapBtn = document.getElementById('currencySwapBtn');
    
    if (!currencyAmount || !currencyFrom || !currencyTo || !currencyResult || !currencySwapBtn) return;
    
    // Update calculation when inputs change
    const updateCalculation = () => {
        if (Object.keys(exchangeRates).length === 0) return;
        
        const amount = parseFloat(currencyAmount.value) || 0;
        const fromCurrency = currencyFrom.value;
        const toCurrency = currencyTo.value;
        
        // Convert to target currency
        const convertedAmount = convertCurrency(amount, fromCurrency, toCurrency);
        
        // Update result
        currencyResult.value = convertedAmount.toFixed(2);
    };
    
    // Attach event listeners
    currencyAmount.addEventListener('input', updateCalculation);
    currencyFrom.addEventListener('change', updateCalculation);
    currencyTo.addEventListener('change', updateCalculation);
    
    // Swap currencies button
    currencySwapBtn.addEventListener('click', () => {
        const fromValue = currencyFrom.value;
        const toValue = currencyTo.value;
        
        currencyFrom.value = toValue;
        currencyTo.value = fromValue;
        
        // Animate button
        currencySwapBtn.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            currencySwapBtn.style.transform = '';
        }, 300);
        
        updateCalculation();
    });
}

// Fetch exchange rates from API
async function fetchExchangeRates() {
    const currencyRates = document.getElementById('currencyRates');
    if (!currencyRates) return;
    
    // Show loading state
    currencyRates.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Завантаження курсів валют...</p>
        </div>
    `;
    
    try {
        // Fetch exchange rates from API
        const response = await fetch(API_CONFIG.getApiUrl('currency/available'));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Store exchange rates globally
        exchangeRates = await response.json();
        
        // Render exchange rates
        renderExchangeRates(exchangeRates);
        
        // Update converter with new rates
        const updateEvent = new Event('input');
        const currencyAmount = document.getElementById('currencyAmount');
        if (currencyAmount) {
            currencyAmount.dispatchEvent(updateEvent);
        }
    } catch (error) {
        console.error('Currency API error:', error);
        currencyRates.innerHTML = `
            <div class="currency-error">
                <span class="material-icons">error_outline</span>
                <p>Не вдалося завантажити курси валют.</p>
                <button id="retryCurrencyBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retryCurrencyBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                fetchExchangeRates();
            });
        }
    }
}

// Convert currency using exchange rates
function convertCurrency(amount, fromCurrency, toCurrency) {
    // If currencies are the same, return the same amount
    if (fromCurrency === toCurrency) return amount;
    
    // Convert from source currency to UAH (if not already UAH)
    let amountInUah;
    if (fromCurrency === BASE_CURRENCY) {
        amountInUah = amount;
    } else {
        // Convert to base currency using rate
        amountInUah = amount * exchangeRates[fromCurrency].rate;
    }
    
    // Convert from UAH to target currency (if not UAH)
    if (toCurrency === BASE_CURRENCY) {
        return amountInUah;
    } else {
        // Convert from base currency using rate
        return amountInUah / exchangeRates[toCurrency].rate;
    }
}

// Render exchange rates
function renderExchangeRates(rates) {
    const currencyRates = document.getElementById('currencyRates');
    if (!currencyRates) return;
    
    // Create HTML
    let html = `
        <h3 class="currency-rates-title">Курси валют до гривні (НБУ) 📊</h3>
        <div class="currency-rates-grid">
    `;
    
    // Create items for each currency
    Object.keys(rates).forEach(currency => {
        if (currency !== BASE_CURRENCY) {
            const rate = rates[currency];
            const changeClass = rate.change > 0 ? 'positive' : (rate.change < 0 ? 'negative' : '');
            const changeSymbol = rate.change > 0 ? '+' : '';
            
            html += `
                <div class="currency-rate-card">
                    <span class="currency-symbol">${getCurrencySymbol(currency)}</span>
                    <div class="currency-code">${currency}</div>
                    <div class="currency-value">${rate.rate.toFixed(2)}</div>
                    <span class="currency-change ${changeClass}">${changeSymbol}${rate.change.toFixed(2)}</span>
                </div>
            `;
        }
    });
    
    html += '</div>';
    
    // Update DOM
    currencyRates.innerHTML = html;
    
    // Add animation
    const rateCards = currencyRates.querySelectorAll('.currency-rate-card');
    rateCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 50));
    });
}

// Get currency symbol
function getCurrencySymbol(currency) {
    const symbols = {
        'UAH': '₴',
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'PLN': 'zł',
        'JPY': '¥',
        'CHF': 'Fr',
        'CAD': 'C$',
        'AUD': 'A$'
    };
    
    return symbols[currency] || currency;
}