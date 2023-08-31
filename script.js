// Menyeleksi Elemen
const inputKota = document.querySelector(".input-kota");
const searchButton = document.querySelector(".search-btn");
const locationButton = document.querySelector(".location-btn");
const cuacaTerakhirDiv = document.querySelector(".cuaca-terakhir");
const kartuCuacaDiv = document.querySelector(".kartu-cuaca");

// Menyeleksi API dari OpenWeatherMap.org
const API_KEY = "a934ee01ccee347d810fcac52df1dc64";

// Fungsi untuk menghasilkan tampilan informasi cuaca
const kartuCuaca = (namaKota, itemCuaca, index) => {
    // Jika index adalah 0, tampilkan informasi cuaca utama
    if(index === 0) {
        // Menghasilkan HTML dengan informasi cuaca
        return `<div class="detail">
                    <h2>${namaKota} (${itemCuaca.dt_txt.split(" ")[0]})</h2>
                    <h6>Suhu: ${(itemCuaca.main.temp - 273.15).toFixed(2)}°C</h6>
                    <h6>Angin: ${itemCuaca.wind.speed} M/S</h6>
                    <h6>Kelembapan: ${itemCuaca.main.humidity}%</h6>        
                </div>
                <div class="icon">
                    <img src="https://openweathermap.org/img/wn/${itemCuaca.weather[0].icon}@4x.png" alt="weather-icon">
                    <h6>${itemCuaca.weather[0].description}</h6>
                </div>`;
    }
}

// Fungsi untuk mengambil dan menampilkan ramalan cuaca
const detailCuaca = (namaKota, latitude, longitude) => {
    // URL API untuk mengambil data ramalan cuaca berdasarkan latitude dan longitude
    const WEATHER_API_URL = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${API_KEY}`;

    // Mengambil data cuaca dari API OpenWeatherMap.org
    fetch(WEATHER_API_URL).then(response => response.json()).then(data => {
        const ramalanHari = [];
        // Mengambil ramalan cuaca untuk enam hari ke depan
        const enamHariRamalan = data.list.filter(ramalan => {
            const tanggalRamalan = new Date(ramalan.dt_txt).getDate();
            if(!ramalanHari.includes(tanggalRamalan)) {
                return ramalanHari.push(tanggalRamalan);
            }
        });

        // Mengkosongkan input kota, div cuaca terakhir, dan div kartu cuaca
        inputKota.value = "";
        cuacaTerakhirDiv.innerHTML = "";
        kartuCuacaDiv.innerHTML = "";

        // Menampilkan kartu cuaca untuk enam hari ke depan
        enamHariRamalan.forEach((itemCuaca, index) => {
            const html = kartuCuaca(namaKota, itemCuaca, index);
            if(index === 0) {
                // Menampilkan kartu cuaca pertama pada div cuaca terakhir
                cuacaTerakhirDiv.insertAdjacentHTML("beforeend", html);
            } else {
                // Menampilkan kartu cuaca lainnya pada div kartu cuaca
                kartuCuacaDiv.insertAdjacentHTML("beforeend", html);
            }
        });
    }).catch(() => {
        // Menampilkan pesan kesalahan jika terjadi masalah saat mengambil data cuaca
        alert("Terjadi kesalahan saat mengambil ramalan cuaca!")
    })
}