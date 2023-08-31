// Menyeleksi Elemen
const cityInput = document.querySelector(".input-kota");
const searchButton = document.querySelector(".search-btn");
const locationButton = document.querySelector(".location-btn");
const currentWeatherDiv = document.querySelector(".cuaca-terakhir");
const weatherCardsDiv = document.querySelector(".kartu-cuaca");

// Menyeleksi API dari OpenWeatherMap.org
const API_KEY = "a934ee01ccee347d810fcac52df1dc64";

// Fungsi untuk menghasilkan tampilan informasi cuaca
const createWeatherCard = (cityName, weatherItem, index) => {
    // Jika index adalah 0, tampilkan informasi cuaca utama
    if(index === 0) {
        // Menghasilkan HTML dengan informasi cuaca
        return `<div class="detail">
                    <h2>${cityName} (${weatherItem.dt_txt.split(" ")[0]})</h2>
                    <h6>Suhu: ${(weatherItem.main.temp - 273.15).toFixed(2)}°C</h6>
                    <h6>Angin: ${weatherItem.wind.speed} M/S</h6>
                    <h6>Kelembapan: ${weatherItem.main.humidity}%</h6>        
                </div>
                <div class="icon">
                    <img src="https://openweathermap.org/img/wn/${weatherItem.weather[0].icon}@4x.png" alt="weather-icon">
                    <h6>${weatherItem.weather[0].description}</h6>
                </div>`;
    } else {
        return `<li class="card">
                    <h3>(${weatherItem.dt_txt.split(" ")[0]})</h3>
                    <img src="https://openweathermap.org/img/wn/${weatherItem.weather[0].icon}@4x.png" alt="weather-icon">
                    <h6>Suhu: ${(weatherItem.main.temp - 273.15).toFixed(2)}C</h6>
                    <h6>Angin: ${weatherItem.wind.speed} M/S</h6>
                    <h6>Kelembapan: ${weatherItem.main.humidity}%</h6>
                </li>`;
    }
}

// Fungsi untuk mengambil dan menampilkan ramalan cuaca
const getWeatherDetails = (cityName, latitude, longitude) => {
    // URL API untuk mengambil data ramalan cuaca berdasarkan latitude dan longitude
    const WEATHER_API_URL = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}`;

    // Mengambil data cuaca dari API OpenWeatherMap.org
    fetch(WEATHER_API_URL).then(response => response.json()).then(data => {
        const uniqueForecastDays = [];
        // Mengambil ramalan cuaca untuk enam hari ke depan
        const fiveDaysForecast = data.list.filter(forecast => {
            const forecastDate = new Date(forecast.dt_txt).getDate();
            if(!uniqueForecastDays.includes(forecastDate)) {
                return uniqueForecastDays.push(forecastDate);
            }
        });

        // Mengkosongkan input kota, div cuaca terakhir, dan div kartu cuaca
        cityInput.value = "";
        currentWeatherDiv.innerHTML = "";
        weatherCardsDiv.innerHTML = "";

        // Menampilkan kartu cuaca untuk enam hari ke depan
        fiveDaysForecast.forEach((weatherItem, index) => {
            const html = createWeatherCard(cityName, weatherItem, index);
            if(index === 0) {
                // Menampilkan kartu cuaca pertama pada div cuaca terakhir
                currentWeatherDiv.insertAdjacentHTML("beforeend", html);
            } else {
                // Menampilkan kartu cuaca lainnya pada div kartu cuaca
                weatherCardsDiv.insertAdjacentHTML("beforeend", html);
            }
        });
    }).catch(() => {
        // Menampilkan pesan kesalahan jika terjadi masalah saat mengambil data cuaca
        alert("Terjadi kesalahan saat mengambil ramalan cuaca!")
    })
}

// Fungsi untuk mengambil koordinat kota dan menampilkan ramalan cuaca
const getCityCoordinates = () => {
    // Mengambil nama kota dari input dan menghilangkan spasi di awal dan akhir
    const cityName = cityInput.value.trim();
    // Jika nama kota kosong, tidak ada tindakan lebih lanjut
    if(cityName === "") {
        return;
    }
    // URL API untuk mengambil koordinat kota berdasarkan nama kota
    const API_URL = `https://api.openweathermap.org/geo/1.0/direct?q=${cityName}&limit=1&appid=${API_KEY}`;

    // Mengambil data koordinat kota dari API OpenWeatherMap
    fetch(API_URL).then(response => response.json()).then(data => {
        // Jika data tidak ditemukan
        if(!data.length) {
            alert(`Tidak ditemukan koordinat untuk ${cityName}`);
        }
        // Mengambil informasi koordinat dan nama kota
        const {lat, lon, name} = data[0];
        // Memanggil fungsi detailCuaca dengan koordinat dan nama kota
        getWeatherDetails(name, lat, lon);
    }).catch(() => {
        // Menampilkan pesan kesalahan jika terjadi masalah saat mengambil koordinat
        alert("Terjadi kesalahan saat mengambil koordinat!");
    });
}

// Fungsi untuk mengambil koordinat pengguna dan menampilkan ramalan cuaca
const getUserCoordinates = () => {
    // Menggunakan API Geolocation untuk mendapatkan posisi pengguna
    navigator.geolocation.getCurrentPosition(
        // Mengambil koordinat latitude dan longitude dari posisi pengguna
        position => {
            // Mengambil koordinat latitude dan longitude dari posisi pengguna
            const {latitude, longitude} = position.coords;
            // URL API untuk mengambil nama kota berdasarkan koordinat
            const API_URL = `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${API_KEY}`;
            // Mengambil data nama kota dari API OpenWeatherMap
            fetch(API_URL).then(response => response.json()).then(data => {
                // Mengambil informasi nama kota dari data
                const{name} = data[0];
                // Memanggil fungsi detailCuaca dengan informasi nama kota dan koordinat
                getWeatherDetails(name, latitude, longitude);
            }).catch(() => {
                // Menampilkan pesan kesalahan jika terjadi masalah saat mengambil nama kota
                alert("Terjadi kesalahan saat mengambil nama kota!");
            });
        },
        error => {
            // Menghandle jika terjadi error dalam permintaan geolokasi
            if(error.code === error.PERMISSION_DENIED) {
                alert("Permintaan geolokasi ditolak. Harap setel ulang izin lokasi untuk memberikan akses lagi.");
            } else {
                alert("Kesalahan permintaan geolokasi. Harap setel ulang izin lokasi.");
            }
        });
}

// Menambahkan event listener pada tombol untuk mendapatkan koordinat pengguna
locationButton.addEventListener("click", getUserCoordinates);
// Menambahkan event listener pada tombol untuk mendapatkan koordinat kota berdasarkan input
searchButton.addEventListener("click", getCityCoordinates);
// Menambahkan event listener pada input kota untuk mendapatkan koordinat ketika tombol Enter ditekan
cityInput.addEventListener("keyup", e => e.key === "Enter" && getCityCoordinates());