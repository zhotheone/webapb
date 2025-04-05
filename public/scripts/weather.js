// Weather Module
let currentLocation = 'Kyiv';

// Initialize weather
document.addEventListener('DOMContentLoaded', function() {
    setupWeather();
});

// Load weather data
function loadWeatherData() {
    const locationSelect = document.getElementById('weatherLocation');
    if (locationSelect) {
        currentLocation = locationSelect.value;
    }
    
    fetchWeatherData(currentLocation);
}

// Setup weather functionality
function setupWeather() {
    const locationSelect = document.getElementById('weatherLocation');
    if (!locationSelect) return;
    
    // Load weather when location changes
    locationSelect.addEventListener('change', () => {
        currentLocation = locationSelect.value;
        fetchWeatherData(currentLocation);
    });
}

// Fetch weather data from API
async function fetchWeatherData(location) {
    const weatherDisplay = document.getElementById('weatherDisplay');
    if (!weatherDisplay) return;
    
    // Show loading state
    weatherDisplay.innerHTML = `
        <div class="loading-spinner">
            <span class="material-icons rotating">refresh</span>
            <p>Завантаження погоди...</p>
        </div>
    `;
    
    try {
        // Use fetchWithCORS instead of direct fetch to avoid CORS issues
        const data = await API_CONFIG.fetchWithCORS(`weather/${encodeURIComponent(location)}`);
        
        // Render weather data
        renderWeatherData(data);
    } catch (error) {
        console.error('Weather API error:', error);
        weatherDisplay.innerHTML = `
            <div class="weather-error">
                <span class="material-icons">error_outline</span>
                <p>Не вдалося завантажити дані погоди для "${location}".</p>
                <button id="retryWeatherBtn" class="button">Спробувати знову</button>
            </div>
        `;
        
        // Add retry button functionality
        const retryBtn = document.getElementById('retryWeatherBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                fetchWeatherData(location);
            });
        }
    }
}

// Render weather data
function renderWeatherData(data) {
    const weatherDisplay = document.getElementById('weatherDisplay');
    if (!weatherDisplay) return;
    
    // Set weather icon based on conditions
    const weatherIcon = getWeatherIcon(data.condition);
    
    // Create HTML
    weatherDisplay.innerHTML = `
        <div class="weather-current">
            <span class="material-icons weather-icon">${weatherIcon}</span>
            <div class="weather-temp">${data.temperature}°C</div>
            <div class="weather-description">${data.description}</div>
            <div class="weather-location-name">${data.location}, ${data.country}</div>
        </div>
        
        <div class="weather-details">
            <div class="weather-detail-item">
                <span class="material-icons weather-detail-icon">water_drop</span>
                <div class="weather-detail-value">${data.humidity}%</div>
                <div class="weather-detail-label">Вологість</div>
            </div>
            <div class="weather-detail-item">
                <span class="material-icons weather-detail-icon">air</span>
                <div class="weather-detail-value">${data.windSpeed} км/г</div>
                <div class="weather-detail-label">Вітер</div>
            </div>
            <div class="weather-detail-item">
                <span class="material-icons weather-detail-icon">compress</span>
                <div class="weather-detail-value">${data.pressure} гПа</div>
                <div class="weather-detail-label">Тиск</div>
            </div>
        </div>
        
        <div class="weather-forecast">
            ${renderForecast(data.forecast)}
        </div>
    `;
    
    // Add animation to elements
    addWeatherAnimations();
}

// Render forecast items
function renderForecast(forecast) {
    return forecast.map(day => {
        const icon = getWeatherIcon(day.condition);
        return `
            <div class="forecast-item">
                <div class="forecast-day">${day.day}</div>
                <span class="material-icons forecast-icon">${icon}</span>
                <div class="forecast-temp">${day.minTemp}° / ${day.maxTemp}°</div>
            </div>
        `;
    }).join('');
}

// Add animations to weather elements
function addWeatherAnimations() {
    // Current weather fade in
    const currentWeather = document.querySelector('.weather-current');
    if (currentWeather) {
        currentWeather.style.opacity = '0';
        currentWeather.style.transform = 'translateY(20px)';
        currentWeather.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        
        setTimeout(() => {
            currentWeather.style.opacity = '1';
            currentWeather.style.transform = 'translateY(0)';
        }, 100);
    }
    
    // Weather details fade in
    const detailItems = document.querySelectorAll('.weather-detail-item');
    detailItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        item.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        
        setTimeout(() => {
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, 500 + (index * 100));
    });
    
    // Forecast items fade in
    const forecastItems = document.querySelectorAll('.forecast-item');
    forecastItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(20px)';
        item.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        
        setTimeout(() => {
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, 800 + (index * 100));
    });
}

// Get weather icon based on condition
function getWeatherIcon(condition) {
    switch(condition?.toLowerCase()) {
        case 'clear':
        case 'sunny':
            return 'wb_sunny';
        case 'partly cloudy':
        case 'clouds':
            return 'partly_cloudy_day';
        case 'cloudy':
        case 'broken clouds':
        case 'scattered clouds':
            return 'cloud';
        case 'overcast':
        case 'overcast clouds':
            return 'cloud';
        case 'mist':
        case 'fog':
        case 'haze':
            return 'cloud';
        case 'rain':
        case 'light rain':
        case 'moderate rain':
        case 'drizzle':
            return 'rainy';
        case 'heavy rain':
        case 'extreme rain':
            return 'thunderstorm';
        case 'snow':
        case 'light snow':
            return 'ac_unit';
        case 'heavy snow':
            return 'ac_unit';
        case 'thunderstorm':
            return 'flash_on';
        default:
            return 'wb_sunny';
    }
}

// Weather UI script with city search functionality

const DEFAULT_CITY = 'Запоріжжя';
let currentCity = DEFAULT_CITY;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize weather component
    initWeatherUI();
    
    // Load default city weather on page load
    loadWeatherForCity(DEFAULT_CITY);
});

// Initialize the weather UI
function initWeatherUI() {
    // Create the search form if it doesn't exist
    if (!document.getElementById('weatherSearchForm')) {
        const weatherContainer = document.getElementById('weatherContainer');
        if (!weatherContainer) return;
        
        // Add search form before the weather content
        const searchForm = document.createElement('form');
        searchForm.id = 'weatherSearchForm';
        searchForm.className = 'weather-search-form';
        searchForm.innerHTML = `
            <div class="weather-search-wrapper">
                <input 
                    type="text" 
                    id="citySearchInput" 
                    placeholder="Введіть назву міста" 
                    value="${DEFAULT_CITY}" 
                    autocomplete="off"
                />
                <button type="submit" id="searchCityBtn">
                    <span class="material-icons">search</span>
                </button>
            </div>
        `;
        
        // Insert at the beginning of weather container
        weatherContainer.insertBefore(searchForm, weatherContainer.firstChild);
        
        // Add event listeners
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const cityInput = document.getElementById('citySearchInput');
            const city = cityInput.value.trim();
            
            if (city) {
                loadWeatherForCity(city);
            }
        });
    }
}

// Load weather data for specified city
function loadWeatherForCity(city) {
    if (!city) return;
    
    // Show loading state
    const weatherContent = document.getElementById('weatherContent');
    if (weatherContent) {
        weatherContent.innerHTML = `
            <div class="weather-loading">
                <span class="material-icons rotating">refresh</span>
                <p>Завантаження погоди для ${city}...</p>
            </div>
        `;
    }
    
    // Update current city
    currentCity = city;
    
    // Call the API to get weather data
    fetch(`/api/weather/${encodeURIComponent(city)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Не вдалося отримати погоду для міста ${city}`);
            }
            return response.json();
        })
        .then(data => {
            displayWeatherData(data);
        })
        .catch(error => {
            console.error('Error fetching weather data:', error);
            if (weatherContent) {
                weatherContent.innerHTML = `
                    <div class="weather-error">
                        <span class="material-icons">error_outline</span>
                        <p>Не вдалося завантажити дані погоди</p>
                        <p class="error-details">${error.message}</p>
                    </div>
                `;
            }
        });
}

// Display weather data in the UI
function displayWeatherData(data) {
    // Get the container for weather content
    const weatherContent = document.getElementById('weatherContent');
    if (!weatherContent) return;
    
    // Format the weather display
    const html = `
        <div class="weather-header">
            <h2>${data.location}, ${data.country}</h2>
        </div>
        <div class="weather-current">
            <div class="weather-temp">
                <span class="temp-value">${data.temperature}°C</span>
                <span class="temp-feels-like">Відчувається як ${data.feelsLike}°C</span>
            </div>
            <div class="weather-condition">
                <span class="weather-icon ${data.condition}"></span>
                <span class="condition-text">${data.description}</span>
            </div>
        </div>
        <div class="weather-details">
            <div class="weather-detail">
                <span class="material-icons">water_drop</span>
                <span>Вологість: ${data.humidity}%</span>
            </div>
            <div class="weather-detail">
                <span class="material-icons">air</span>
                <span>Вітер: ${data.windSpeed} км/г</span>
            </div>
            <div class="weather-detail">
                <span class="material-icons">compress</span>
                <span>Тиск: ${data.pressure} гПа</span>
            </div>
        </div>
        <div class="weather-forecast">
            <h3>Прогноз на 5 днів</h3>
            <div class="forecast-list">
                ${data.forecast.map(day => `
                    <div class="forecast-item">
                        <span class="day">${day.day}</span>
                        <span class="weather-icon small ${day.condition}"></span>
                        <span class="temp-range">${day.minTemp}° / ${day.maxTemp}°</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    weatherContent.innerHTML = html;
}