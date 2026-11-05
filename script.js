// ============================================================
// Aplikasi Periksa Cuaca - logika utama
// ============================================================

// Menyeleksi elemen
const cityInput = document.querySelector(".input-kota");
const searchButton = document.querySelector(".search-btn");
const locationButton = document.querySelector(".location-btn");
const currentWeatherDiv = document.querySelector(".cuaca-terakhir");
const weatherCardsDiv = document.querySelector(".kartu-cuaca");
const forecastTitle = document.querySelector(".judul-ramalan");
const suggestionList = document.querySelector("#daftar-saran");
// Kartu cuaca utama digambar ulang tiap pencarian, jadi nilai berwarna
// (kualitas udara, indeks UV, polen) disimpan di state dan baru ditempel ke
// <span> hasil render terbaru. Semua memakai mekanisme yang sama.
const createToneState = () => ({ text: "__", tone: null, title: null });

let airValueState = createToneState();
let uvValueState = createToneState();
let pollenValueState = createToneState();
// Nilai mentah AQI/UV dipakai untuk ringkasan dan peringatan, bukan hanya teks.
let environmentState = { aqi: null, uv: null };

// Warna mengikuti atribut data-tone; tokennya ada di src/tailwind.css.
const TONE_CLASSES = "font-semibold data-[tone=hijau]:text-aqi-hijau data-[tone=kuning]:text-aqi-kuning data-[tone=oranye]:text-aqi-oranye data-[tone=merah]:text-aqi-merah data-[tone=ungu]:text-aqi-ungu";

const toneMarkup = (id, state) => {
    const tone = state.tone ? ` data-tone="${escapeHtml(state.tone)}"` : "";
    const title = state.title ? ` title="${escapeHtml(state.title)}"` : "";
    return `<span class="${TONE_CLASSES}" id="${id}"${tone}${title}>${escapeHtml(state.text)}</span>`;
};

const paintTone = (id, state) => {
    const node = document.querySelector(`#${id}`);
    if (!node) return;

    node.textContent = state.text;

    if (state.tone) node.setAttribute("data-tone", state.tone);
    else node.removeAttribute("data-tone");

    if (state.title) node.setAttribute("title", state.title);
    else node.removeAttribute("title");
};

const airValueMarkup = () => toneMarkup("nilai-udara", airValueState);
const paintAirValue = () => paintTone("nilai-udara", airValueState);
const uvValueMarkup = () => toneMarkup("nilai-uv", uvValueState);
const paintUvValue = () => paintTone("nilai-uv", uvValueState);
const pollenValueMarkup = () => toneMarkup("nilai-polen", pollenValueState);
const paintPollenValue = () => paintTone("nilai-polen", pollenValueState);
const suggestionStatus = document.querySelector("#status-saran");
const notice = document.querySelector("#pesan");
const noticeText = document.querySelector("#pesan-teks");
const noticeRetry = document.querySelector("#pesan-coba");
const noticeClose = document.querySelector("#pesan-tutup");
const unitButtons = Array.from(document.querySelectorAll(".satuan-btn"));
const detailPanel = document.querySelector("#rincian");
const detailTitle = document.querySelector("#rincian-judul");
const detailList = document.querySelector("#rincian-daftar");
const detailClose = document.querySelector("#rincian-tutup");

// Elemen baru: tema, ringkasan, peringatan, per jam, favorit, dan radar.
const themeButton = document.querySelector("#tombol-tema");
const themeIcon = document.querySelector("#ikon-tema");
const insightText = document.querySelector("#insight");
const insightList = document.querySelector("#ringkasan-daftar");
const alertBox = document.querySelector("#peringatan");
const alertTitle = document.querySelector("#peringatan-judul");
const alertText = document.querySelector("#peringatan-teks");
const hourlyList = document.querySelector("#daftar-jam");
const favoritesList = document.querySelector("#daftar-favorit");
const favoriteSave = document.querySelector("#simpan-favorit");
const favoriteEmpty = document.querySelector("#favorit-kosong");
const radarPanel = document.querySelector("#radar");
const radarMap = document.querySelector("#radar-peta");
const radarStatus = document.querySelector("#radar-status");
const radarToggle = document.querySelector("#radar-main");
const radarPlay = document.querySelector("#radar-putar");

// API key OpenWeatherMap.
// PERINGATAN: key di sisi klien selalu bisa dilihat pengunjung.
// Batasi key per-domain di dashboard OpenWeather, atau proxy lewat backend.
const API_KEY = "a934ee01ccee347d810fcac52df1dc64";

// Hari ini + 5 hari berikutnya = maksimal 6 tanggal.
const MAX_FORECAST_DAYS = 6;
const DEFAULT_CITY_NAME = "Lokasi Anda";

// Kualitas udara: AQI OpenWeatherMap memakai skala 1-5.
const AIR_QUALITY_LEVELS = {
    1: { label: "Baik", tone: "hijau", verdict: "Kualitas udara baik. Aman untuk aktivitas di luar ruangan." },
    2: { label: "Sedang", tone: "kuning", verdict: "Kualitas udara cukup baik. Kelompok sensitif (anak, lansia, penderita asma) sebaiknya tidak beraktivitas terlalu lama di luar." },
    3: { label: "Kurang baik", tone: "oranye", verdict: "Kualitas udara kurang baik bagi kelompok sensitif. Batasi aktivitas luar ruangan yang panjang." },
    4: { label: "Buruk", tone: "merah", verdict: "Kualitas udara buruk. Kurangi aktivitas di luar ruangan dan pakai masker bila keluar." },
    5: { label: "Sangat buruk", tone: "ungu", verdict: "Kualitas udara sangat buruk. Hindari aktivitas di luar ruangan." },
};

// Indeks UV memakai skala WHO (0-2 rendah ... 11+ ekstrem).
const UV_LEVELS = [
    { max: 2.999, label: "Rendah", tone: "hijau", verdict: "Tidak perlu pelindung khusus." },
    { max: 5.999, label: "Sedang", tone: "kuning", verdict: "Pakai tabir surya dan kacamata bila beraktivitas lama di luar." },
    { max: 7.999, label: "Tinggi", tone: "oranye", verdict: "Lindungi kulit: tabir surya, topi, dan hindari matahari siang." },
    { max: 10.999, label: "Sangat Tinggi", tone: "merah", verdict: "Risiko terbakar tinggi. Batasi paparan matahari pukul 10.00-16.00." },
    { max: Infinity, label: "Ekstrem", tone: "ungu", verdict: "Hindari paparan matahari langsung; kulit bisa terbakar dalam hitungan menit." },
];

// Polen (serbuk sari). Open-Meteo mengirim konsentrasi per jenis tumbuhan
// dalam butir/m³; ambang di bawah adalah perkiraan yang lazim dipakai.
const POLLEN_TYPES = [
    { key: "grass_pollen", label: "Rumput" },
    { key: "birch_pollen", label: "Birch" },
    { key: "alder_pollen", label: "Alder" },
    { key: "olive_pollen", label: "Zaitun" },
    { key: "mugwort_pollen", label: "Mugwort" },
    { key: "ragweed_pollen", label: "Ragweed" },
];

const POLLEN_LEVELS = [
    { max: 9.999, label: "Rendah", tone: "hijau" },
    { max: 49.999, label: "Sedang", tone: "kuning" },
    { max: 199.999, label: "Tinggi", tone: "oranye" },
    { max: Infinity, label: "Sangat Tinggi", tone: "merah" },
];

// Arah angin: derajat (0 = dari Utara) -> 16 mata angin.
const COMPASS_POINTS = [
    "Utara", "Timur Laut", "Timur", "Tenggara",
    "Selatan", "Barat Daya", "Barat", "Barat Laut",
];

// Autocomplete kota: nama kota tidak unik, jadi tampilkan beberapa kandidat.
const SUGGESTION_LIMIT = 5;
const SUGGESTION_MIN_LENGTH = 2;
const SUGGESTION_DEBOUNCE_MS = 350;

// ============================================================
// Label tanggal
// ============================================================
// dt / dt_txt dari API memakai UTC. Yang benar untuk ditampilkan adalah
// tanggal menurut zona waktu KOTA yang dicari, bukan zona waktu perangkat:
// orang di Jakarta yang mencari cuaca London tetap harus melihat tanggal
// London. OpenWeatherMap mengirim offset kota pada `city.timezone`
// (detik dari UTC, mis. 25200 untuk WIB).

// Formatter patokan UTC: waktu digeser sebesar offset kota lebih dulu,
// sehingga hasilnya adalah tanggal lokal kota tersebut.
const utcDateFormatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
});

// Cadangan bila offset kota tidak tersedia: kembali ke zona waktu perangkat.
const deviceDateFormatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

// Offset zona waktu yang masuk akal: UTC-14:00 sampai UTC+14:00.
const MAX_TIMEZONE_OFFSET = 14 * 60 * 60;

const formatDate = (unixSeconds, offsetSeconds) => {
    const timestamp = toNumber(unixSeconds);
    if (!Number.isFinite(timestamp)) return "--";

    const offset = toNumber(offsetSeconds);
    const hasOffset = Number.isFinite(offset) && Math.abs(offset) <= MAX_TIMEZONE_OFFSET;
    // Geser waktu sebesar offset kota, lalu baca sebagai UTC. Cara ini
    // menghormati offset pecahan (mis. +05:30) tanpa memetakan offset ke
    // nama zona waktu IANA.
    const date = new Date((hasOffset ? timestamp + offset : timestamp) * 1000);
    // Timestamp ekstrem tetap menghasilkan Invalid Date, dan Intl.format()
    // akan melempar RangeError sampai seluruh render gagal.
    if (Number.isNaN(date.getTime())) return "--";

    return hasOffset ? utcDateFormatter.format(date) : deviceDateFormatter.format(date);
};

// ============================================================
// Preferensi pengguna (satuan + kota terakhir)
// ============================================================
const STORAGE_KEY = "periksa-cuaca:preferensi";
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Batas waktu permintaan: tanpa ini fetch yang menggantung membuat kartu
// kosong dan tombol terkunci selamanya.
const REQUEST_TIMEOUT_MS = 15000;
const CURRENT_TIMEOUT_MS = 6000;

// "metric" = °C & m/s, "imperial" = °F & mph.
let units = "metric";
let lastLocation = null;
// Data yang sedang tampil, dipakai ulang saat satuan diganti.
let activeView = null;
// Kota yang terakhir diminta (bisa saja gagal), untuk tombol "Coba lagi".
let lastAttempt = null;

const readStorage = () => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
};

const writeStorage = () => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            units,
            city: lastLocation,
            theme: themePreference,
            favorites,
        }));
    } catch {
        // Mode privat atau kuota penuh: aplikasi tetap jalan tanpa preferensi.
    }
};

// Kelvin -> satuan aktif.
const formatTemperature = (kelvin) => {
    const value = toNumber(kelvin);
    const suffix = units === "imperial" ? "°F" : "°C";
    if (!Number.isFinite(value)) return `--${suffix}`;

    const celsius = value - 273.15;
    if (units === "imperial") return `${(celsius * 9 / 5 + 32).toFixed(2)}°F`;
    return `${celsius.toFixed(2)}°C`;
};

// Meter/detik -> satuan aktif (mph untuk imperial), dibulatkan 1 desimal.
const formatWindSpeed = (metersPerSecond) => {
    const value = toNumber(metersPerSecond);
    const label = units === "imperial" ? "mph" : "M/S";
    if (!Number.isFinite(value)) return `-- ${label}`;

    const converted = units === "imperial" ? value * 2.2369362921 : value;
    return `${Math.round(converted * 10) / 10} ${label}`;
};

// Derajat angin -> mata angin ("Timur Laut"); kosong bila data tidak ada.
const describeWindDirection = (degrees) => {
    const value = toNumber(degrees);
    if (!Number.isFinite(value)) return "";

    const normalized = ((value % 360) + 360) % 360;
    return COMPASS_POINTS[Math.round(normalized / 45) % COMPASS_POINTS.length];
};

// Jam menurut zona waktu kota (offset detik dari UTC).
const formatTime = (unixSeconds, offsetSeconds) => {
    const timestamp = toNumber(unixSeconds);
    if (!Number.isFinite(timestamp)) return "--.--";

    const offset = toNumber(offsetSeconds);
    const hasOffset = Number.isFinite(offset) && Math.abs(offset) <= MAX_TIMEZONE_OFFSET;
    const date = new Date((timestamp + (hasOffset ? offset : 0)) * 1000);
    if (Number.isNaN(date.getTime())) return "--.--";

    // Tanpa offset kota, pakai jam perangkat: formatDate juga jatuh ke zona
    // perangkat, jadi tanggal dan jam harus memakai acuan yang sama.
    const hours = String(hasOffset ? date.getUTCHours() : date.getHours()).padStart(2, "0");
    const minutes = String(hasOffset ? date.getUTCMinutes() : date.getMinutes()).padStart(2, "0");
    return `${hours}.${minutes}`;
};

// ============================================================
// Tema terang/gelap & latar dinamis
// ============================================================
// themePreference: null = ikuti sistem, "light"/"dark" = pilihan manual.
let themePreference = null;

const systemThemeQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

const prefersDarkTheme = () => Boolean(systemThemeQuery && systemThemeQuery.matches);
const resolvedTheme = () => themePreference || (prefersDarkTheme() ? "dark" : "light");

const applyTheme = () => {
    const theme = resolvedTheme();
    if (document.documentElement) document.documentElement.setAttribute("data-theme", theme);

    if (themeButton) {
        themeButton.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
        themeButton.setAttribute("aria-label", theme === "dark" ? "Aktifkan tema terang" : "Aktifkan tema gelap");
    }
    if (themeIcon) themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
};

const toggleTheme = () => {
    themePreference = resolvedTheme() === "dark" ? "light" : "dark";
    applyTheme();
    writeStorage();
};

// Kode kondisi OpenWeatherMap -> nama latar. Ikon berakhiran "n" berarti malam.
const describeSky = (weatherItem) => {
    const weather = (weatherItem && weatherItem.weather && weatherItem.weather[0]) || {};
    const code = toNumber(weather.id);
    const icon = typeof weather.icon === "string" ? weather.icon : "";
    const isNight = icon.endsWith("n");

    if (!Number.isFinite(code)) return { sky: null, isNight };
    if (code >= 200 && code < 300) return { sky: "badai", isNight };
    if (code >= 300 && code < 400) return { sky: "gerimis", isNight };
    if (code >= 500 && code < 600) return { sky: "hujan", isNight };
    if (code >= 600 && code < 700) return { sky: "salju", isNight };
    if (code >= 700 && code < 800) return { sky: "berkabut", isNight };
    if (code === 800) return { sky: isNight ? "malam" : "cerah", isNight };
    if (code <= 802) return { sky: "berawan", isNight };
    return { sky: "mendung", isNight };
};

// Warna latar halaman diatur CSS lewat atribut ini.
const applySky = (view) => {
    if (!document.documentElement) return;
    const { sky } = describeSky(view && view.current);
    if (sky) document.documentElement.setAttribute("data-langit", sky);
    else document.documentElement.removeAttribute("data-langit");
};

// ============================================================
// Pesan status (pengganti alert)
// ============================================================
let noticeRetryAction = null;

const hideNotice = () => {
    noticeRetryAction = null;
    if (notice) notice.hidden = true;
    if (noticeRetry) noticeRetry.hidden = true;
};

const showNotice = (message, options = {}) => {
    if (!notice || !noticeText) return;

    noticeText.textContent = String(message);
    notice.setAttribute("data-kind", options.kind === "info" ? "info" : "gagal");
    noticeRetryAction = typeof options.retry === "function" ? options.retry : null;
    if (noticeRetry) noticeRetry.hidden = !noticeRetryAction;
    notice.hidden = false;
};

// Nomor urut permintaan: respons yang datang terlambat (stale) diabaikan,
// sehingga klik ganda tidak saling menimpa.
let activeRequest = 0;

const isStale = (token) => token !== activeRequest;

// Escape teks sebelum disisipkan ke innerHTML.
const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Konversi angka dari API secara ketat: hanya number valid atau string angka.
// null, "", boolean, dan objek sengaja ditolak supaya tidak berubah jadi 0.
const toNumber = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
};

// Status tombol selama permintaan berjalan.
const setLoading = (isLoading) => {
    searchButton.disabled = isLoading;
    locationButton.disabled = isLoading;
    searchButton.textContent = isLoading ? "Memuat..." : "Search";
};

// Pesan yang mudah dipahami untuk status HTTP yang umum.
const describeStatus = (status) => {
    const messages = {
        400: "Permintaan tidak valid.",
        401: "API key tidak valid atau belum aktif.",
        403: "Akses ke API ditolak.",
        404: "Data tidak ditemukan.",
        429: "Kuota permintaan API habis. Coba lagi beberapa saat lagi.",
    };
    return messages[status] || `Server mengembalikan status ${status}.`;
};

// fetch + validasi status + parsing JSON.
// Selalu melempar Error dengan pesan yang siap ditampilkan ke pengguna.
const requestJson = async (url, options = {}) => {
    const { timeoutMs, ...fetchOptions } = options;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId = null;
    let timedOut = false;

    if (controller) {
        // Gabungkan signal dari pemanggil dengan batas waktu internal.
        const outerSignal = fetchOptions.signal;
        if (outerSignal) {
            if (outerSignal.aborted) controller.abort();
            else if (typeof outerSignal.addEventListener === "function") {
                outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
            }
        }
        fetchOptions.signal = controller.signal;
    }

    if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
    }

    let response;
    try {
        response = await fetch(url, fetchOptions);
    } catch (error) {
        if (error && error.name === "AbortError") {
            if (timedOut) {
                throw new Error("Permintaan ke server terlalu lama. Periksa koneksi internet Anda.");
            }
            // Permintaan yang sengaja dibatalkan bukan kegagalan bagi pengguna:
            // teruskan apa adanya supaya pemanggil bisa mengabaikannya.
            throw error;
        }
        // TypeError di sini berarti jaringan mati, DNS gagal, CORS, dsb.
        throw new Error("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(describeStatus(response.status));
    }

    try {
        return await response.json();
    } catch {
        throw new Error("Respons server tidak dapat dibaca.");
    }
};

// Semua kegagalan tampil sebagai banner, bukan alert() yang memblokir.
// Retry eksplisit dipakai bila kegagalan terjadi sebelum kota sempat tampil
// (mis. geocoding), supaya "Coba lagi" mengulang langkah yang gagal itu.
const reportError = (context, error, retry) => {
    console.error(context, error);

    const retryAction = typeof retry === "function"
        ? retry
        : () => {
            if (lastAttempt) loadWeather(lastAttempt);
            else if (lastLocation) reloadLast();
            else if (cityInput.value.trim() !== "") getCityCoordinates();
        };

    showNotice(`${context} ${error && error.message ? error.message : ""}`.trim(), {
        kind: "gagal",
        retry: retryAction,
    });
};

// Ikon + deskripsi cuaca dari satu entri API.
const buildIcon = (weatherItem, variant = "card") => {
    const weather = (weatherItem && weatherItem.weather && weatherItem.weather[0]) || {};
    const description = weather.description || "";
    const iconUrl = weather.icon
        ? `https://openweathermap.org/img/wn/${escapeHtml(weather.icon)}@4x.png`
        : "";
    const altText = escapeHtml(description || "Ikon cuaca");
    // Ukuran ikon berbeda antara kartu besar dan kartu harian.
    const imgClass = variant === "main"
        ? "-mt-[15px] max-w-[120px]"
        : variant === "hour"
            ? "my-1 h-10 w-10 max-w-none"
            : "-mb-[12px] mt-[5px] max-w-[80px] min-[1321px]:max-[1700px]:max-w-[72px]";

    // Tanpa ikon, jangan hasilkan <img src=""> (browser akan meminta ulang
    // halaman itu sendiri dan menampilkan gambar rusak).
    return {
        description,
        iconMarkup: iconUrl ? `<img src="${iconUrl}" alt="${altText}" class="${imgClass}">` : "",
    };
};

// Angka kelembapan siap tampil ("78%" / "--%").
const formatHumidity = (value) => {
    const humidityValue = toNumber(value);
    return Number.isFinite(humidityValue) ? `${humidityValue}%` : "--%";
};

// Tekanan udara (hPa) siap tampil.
const formatPressure = (value) => {
    const pressure = toNumber(value);
    return Number.isFinite(pressure) && pressure > 0 ? `${Math.round(pressure)} hPa` : "-- hPa";
};

// ============================================================
// Indeks kenyamanan, saran, dan peringatan dini
// ============================================================
const kelvinToCelsius = (value) => {
    const kelvin = toNumber(value);
    return Number.isFinite(kelvin) ? kelvin - 273.15 : NaN;
};

// Angka nyaman tidak cukup: kelembapan dan angin ikut menentukan.
const comfortFrom = (feelsC, humidity, windMps) => {
    const feels = toNumber(feelsC);
    if (!Number.isFinite(feels)) return { label: "Tidak tersedia", tone: "netral" };

    const humid = toNumber(humidity);
    const wind = toNumber(windMps);
    const windy = Number.isFinite(wind) && wind >= 8;

    if (feels < 20 && windy) return { label: "Dingin Berangin", tone: "oranye" };
    if (feels >= 35) return { label: "Panas Ekstrem", tone: "merah" };
    if (feels >= 32 && humid >= 65) return { label: "Panas Lembab", tone: "merah" };
    if (feels >= 32) return { label: "Panas", tone: "oranye" };
    if (feels >= 28) return { label: "Hangat", tone: "kuning" };
    if (feels >= 22) return { label: "Nyaman", tone: "hijau" };
    if (feels >= 16) return { label: "Sejuk", tone: "hijau" };
    return { label: "Dingin", tone: "kuning" };
};

const weatherCodeOf = (item) => {
    const weather = item && Array.isArray(item.weather) ? item.weather[0] : null;
    return toNumber(weather && weather.id);
};

const isRainCode = (item) => {
    const code = weatherCodeOf(item);
    return code >= 200 && code < 600;
};

const maxRainChance = (items) => (Array.isArray(items) ? items : [])
    .reduce((max, item) => Math.max(max, toNumber(item && item.pop) || 0), 0);

// Jam saja bisa menyesatkan: slot "24 jam ke depan" sering jatuh besok,
// jadi sertakan tanggal bila harinya bukan hari ini.
const describeSlotTime = (dt, timezone, todayLabel) => {
    const time = formatTime(dt, timezone);
    const dayLabel = formatDate(dt, timezone);
    const isToday = !todayLabel || dayLabel === todayLabel;
    return isToday || dayLabel === "--" ? `pukul ${time}` : `pukul ${time} (${dayLabel})`;
};

// Peringatan ekstrem diturunkan dari data ramalan yang sudah diambil,
// jadi tidak butuh langganan One Call 3.0 (fitur alerts bawaan OWM).
const computeAlerts = (view) => {
    const alerts = [];
    if (!view) return alerts;

    const hourly = Array.isArray(view.hourly) ? view.hourly.slice(0, 8) : [];
    const timezone = view.timezone;

    const thunder = hourly.find((item) => {
        const code = weatherCodeOf(item);
        return code >= 200 && code < 300;
    });
    const heavyRain = hourly.find((item) => {
        const code = weatherCodeOf(item);
        const volume = toNumber(item && item.rain && item.rain["3h"]);
        return [502, 503, 504, 522].includes(code) || (Number.isFinite(volume) && volume >= 10);
    });
    const strongWind = hourly.find((item) => toNumber(item && item.wind && item.wind.speed) >= 10);

    if (thunder) {
        alerts.push({
            level: "tinggi",
            title: "Potensi badai petir",
            text: `Badai petir diperkirakan ${describeSlotTime(thunder.dt, timezone, view.todayLabel)}. Tunda aktivitas di area terbuka.`,
        });
    }
    if (heavyRain) {
        const volume = toNumber(heavyRain.rain && heavyRain.rain["3h"]);
        const amount = Number.isFinite(volume) ? ` (${Math.round(volume)} mm)` : "";
        alerts.push({
            level: "tinggi",
            title: "Hujan lebat",
            text: `Hujan lebat diperkirakan ${describeSlotTime(heavyRain.dt, timezone, view.todayLabel)}${amount}. Waspadai genangan dan jalan licin.`,
        });
    }

    const feelsValues = hourly
        .map((item) => kelvinToCelsius(item && item.main && item.main.feels_like))
        .filter((value) => Number.isFinite(value));
    if (feelsValues.length > 0) {
        const hottest = Math.max(...feelsValues);
        const coldest = Math.min(...feelsValues);
        if (hottest >= 35) {
            alerts.push({
                level: "sedang",
                title: "Panas menyengat",
                text: `Suhu terasa sampai ${formatTemperature(hottest + 273.15)} dalam 24 jam ke depan. Perbanyak minum dan hindari matahari siang.`,
            });
        }
        if (coldest <= 5) {
            alerts.push({
                level: "sedang",
                title: "Udara dingin",
                text: `Suhu terasa turun sampai ${formatTemperature(coldest + 273.15)}. Kenakan pakaian berlapis.`,
            });
        }
    }

    if (strongWind) {
        alerts.push({
            level: "sedang",
            title: "Angin kencang",
            text: `Angin hingga ${formatWindSpeed(strongWind.wind.speed)} diperkirakan ${describeSlotTime(strongWind.dt, timezone, view.todayLabel)}. Amankan benda ringan di luar.`,
        });
    }

    const uv = environmentState.uv;
    if (Number.isFinite(uv) && uv >= 11) {
        alerts.push({
            level: "sedang",
            title: "UV ekstrem",
            text: `Indeks UV ${Math.round(uv * 10) / 10}. Hindari paparan matahari langsung pada siang hari.`,
        });
    }

    const aqi = environmentState.aqi;
    const airLevel = Number.isFinite(aqi) ? AIR_QUALITY_LEVELS[aqi] : null;
    if (airLevel && aqi >= 4) {
        alerts.push({ level: "sedang", title: "Kualitas udara buruk", text: airLevel.verdict });
    }

    return alerts;
};

const buildAdviceLines = (view) => {
    const current = (view && view.current) || {};
    const main = current.main || {};
    const wind = current.wind || {};
    const tempC = kelvinToCelsius(main.temp);
    const feelsC = kelvinToCelsius(main.feels_like);
    const comfort = comfortFrom(feelsC, main.humidity, wind.speed);
    const hourly = Array.isArray(view && view.hourly) ? view.hourly.slice(0, 8) : [];
    const rainChance = maxRainChance(hourly);
    const uv = environmentState.uv;
    const aqi = environmentState.aqi;
    const lines = [];

    computeAlerts(view).forEach((alert) => {
        lines.push({
            label: alert.title,
            value: alert.text,
            tone: alert.level === "tinggi" ? "merah" : "oranye",
        });
    });

    lines.push({ label: "Kenyamanan", value: comfort.label, tone: comfort.tone });

    let activity;
    if (Number.isFinite(feelsC) && feelsC >= 35) activity = "Hindari aktivitas berat di luar ruangan pada siang hari.";
    else if (Number.isFinite(uv) && uv >= 8) activity = "Batasi aktivitas luar pukul 10.00-16.00 karena UV sangat tinggi.";
    else if (Number.isFinite(aqi) && aqi >= 4) activity = "Kurangi olahraga luar ruangan; kualitas udara buruk.";
    else if (rainChance >= 0.7) activity = "Siapkan payung; peluang hujan tinggi dalam beberapa jam ke depan.";
    else if (rainChance >= 0.4) activity = "Ada kemungkinan hujan; sebaiknya bawa payung.";
    else if (Number.isFinite(feelsC) && feelsC >= 22 && feelsC <= 30) activity = "Cocok untuk lari pagi, bersepeda, atau jalan santai.";
    else if (Number.isFinite(feelsC) && feelsC < 16) activity = "Dingin; lakukan pemanasan lebih lama sebelum berolahraga.";
    else activity = "Waktu yang cukup baik untuk aktivitas ringan di luar ruangan.";
    lines.push({ label: "Saran aktivitas", value: activity, tone: "netral" });

    let clothing;
    if (!Number.isFinite(tempC)) clothing = "Tidak tersedia.";
    else if (tempC >= 30) clothing = "Pakaian tipis dan menyerap keringat; pakai topi bila lama di luar.";
    else if (tempC >= 24) clothing = "Pakaian kasual berbahan ringan.";
    else if (tempC >= 18) clothing = "Kemeja lengan panjang tipis atau jaket ringan.";
    else if (tempC >= 10) clothing = "Jaket atau sweter, terutama pagi dan malam.";
    else clothing = "Jaket tebal, sarung tangan, dan pakaian berlapis.";
    if (rainChance >= 0.5) clothing += " Bawa jas hujan atau payung.";
    lines.push({ label: "Saran pakaian", value: clothing, tone: "netral" });

    const uvLevel = Number.isFinite(uv) ? levelFor(UV_LEVELS, uv) : null;
    lines.push(uvLevel
        ? {
            label: "Indeks UV",
            value: `${uvLevel.label} (${Math.round(uv * 10) / 10}) — ${uvLevel.verdict}`,
            tone: uvLevel.tone,
        }
        : { label: "Indeks UV", value: "Sedang dimuat atau tidak tersedia.", tone: "netral" });

    const airLevel = Number.isFinite(aqi) ? AIR_QUALITY_LEVELS[aqi] : null;
    lines.push(airLevel
        ? {
            label: "Kualitas udara",
            value: `${airLevel.label} (AQI ${aqi}/5) — ${airLevel.verdict}`,
            tone: airLevel.tone,
        }
        : { label: "Kualitas udara", value: "Sedang dimuat atau tidak tersedia.", tone: "netral" });

    return lines;
};

// Satu kalimat kesimpulan untuk bagian paling atas kartu hasil.
const buildInsightSentence = (view) => {
    if (!view) return "";
    const current = view.current || {};
    const main = current.main || {};
    const weather = (current.weather && current.weather[0]) || {};
    const tempC = kelvinToCelsius(main.temp);
    const feelsC = kelvinToCelsius(main.feels_like);
    const hourly = Array.isArray(view.hourly) ? view.hourly.slice(0, 8) : [];
    const rainChance = maxRainChance(hourly);
    const rainSlot = hourly.find((item) => isRainCode(item) && (toNumber(item.pop) || 0) >= 0.5);
    const uv = environmentState.uv;
    const sentences = [];

    if (Number.isFinite(tempC)) {
        const description = typeof weather.description === "string" && weather.description !== ""
            ? `, ${weather.description}`
            : "";
        const difference = Number.isFinite(feelsC) ? feelsC - tempC : 0;
        if (difference >= 3) {
            sentences.push(`Suhu ${formatTemperature(main.temp)} terasa seperti ${formatTemperature(main.feels_like)} karena udara lembap.`);
        } else {
            sentences.push(`Suhu ${formatTemperature(main.temp)}${description}.`);
        }
    }

    if (rainSlot) {
        const chance = Math.round((toNumber(rainSlot.pop) || 0) * 100);
        sentences.push(`Hujan diperkirakan ${describeSlotTime(rainSlot.dt, view.timezone, view.todayLabel)} (peluang ${chance}%).`);
    } else if (rainChance >= 0.4) {
        sentences.push(`Peluang hujan dalam 24 jam sekitar ${Math.round(rainChance * 100)}%.`);
    }

    if (Number.isFinite(uv) && uv >= 8) sentences.push("UV sangat tinggi, gunakan tabir surya.");
    if (rainChance >= 0.5) sentences.push("Bawa payung.");

    return sentences.join(" ");
};

// Kartu besar: kondisi cuaca SAAT INI (endpoint /weather).
// Delapan keterangan disusun dua kolom supaya kartu tidak memanjang ke bawah.
const buildMainCard = (view) => {
    const current = view.current || {};
    const main = current.main || {};
    const wind = current.wind || {};
    const { description, iconMarkup } = buildIcon(current, "main");
    const windDirection = describeWindDirection(wind.deg);
    const line = "text-[16px] font-medium max-[750px]:text-[15px]";

    return `<div class="min-w-0">
                <h2 class="text-[28px] font-bold max-[750px]:text-[1.35rem]">${escapeHtml(view.cityName)} (${escapeHtml(view.todayLabel)})</h2>
                <div class="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 max-[600px]:grid-cols-1">
                    <h6 class="${line}">Suhu: ${formatTemperature(main.temp)}</h6>
                    <h6 class="${line}">Terasa Seperti: ${formatTemperature(main.feels_like)}</h6>
                    <h6 class="${line}">Angin: ${formatWindSpeed(wind.speed)}${windDirection ? ` (${escapeHtml(windDirection)})` : ""}</h6>
                    <h6 class="${line}">Kelembapan: ${formatHumidity(main.humidity)}</h6>
                    <h6 class="${line}">Tekanan Udara: ${formatPressure(main.pressure)}</h6>
                    <h6 class="${line}">Kualitas Udara: ${airValueMarkup()}</h6>
                    <h6 class="${line}">Indeks UV: ${uvValueMarkup()}</h6>
                    <h6 class="${line}">Polen: ${pollenValueMarkup()}</h6>
                </div>
            </div>
            <div class="icon text-center">
                ${iconMarkup}
                <h6 class="-mt-[10px] text-[16px] font-medium capitalize">${escapeHtml(description)}</h6>
            </div>`;
};

// Kartu harian: tombol untuk membuka rincian per 3 jam.
const buildDayCard = (view, day, index) => {
    const main = (day.item && day.item.main) || {};
    const wind = (day.item && day.item.wind) || {};
    const { iconMarkup } = buildIcon(day.item);
    const line = "mt-3 text-[16px] font-medium min-[1321px]:max-[1700px]:text-[13px] max-[750px]:text-[15px]";

    // <button> hanya boleh berisi phrasing content, jadi heading tidak boleh
    // dibungkus tombol. Tombol dibuat sebagai lapisan transparan di atas kartu.
    return `<li class="card relative cursor-pointer list-none rounded-[5px] bg-tile p-[20px_18px] text-white min-[1321px]:max-[1700px]:p-[16px_12px] max-[750px]:p-[16px_14px]">
                <h3 class="text-[20px] font-semibold min-[1321px]:max-[1700px]:text-[18px] max-[750px]:text-[18px]">(${escapeHtml(day.dayLabel)})</h3>
                ${iconMarkup}
                <h6 class="${line}">Suhu: ${formatTemperature(main.temp)}</h6>
                <h6 class="${line}">Angin: ${formatWindSpeed(wind.speed)}</h6>
                <h6 class="${line}">Kelembapan: ${formatHumidity(main.humidity)}</h6>
                <button type="button" class="card-tombol absolute inset-0 h-full w-full cursor-pointer rounded-[5px] border-0 bg-transparent p-0 text-left [font:inherit] focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-[#ffd166]" data-day-index="${index}" aria-expanded="false" aria-controls="rincian">
                    <span class="sr-only">Tampilkan rincian cuaca ${escapeHtml(day.dayLabel)}</span>
                </button>
            </li>`;
};

// ============================================================
// Rincian per 3 jam
// ============================================================
// Penanda kartu yang sedang dibuka: utility Tailwind, bukan kelas CSS sendiri.
const CARD_ACTIVE_CLASSES = ["bg-brand-soft", "shadow-[0_0_0_3px_rgba(255,209,102,0.9)]"];

const setCardActive = (card, isActive) => {
    if (!card) return;
    CARD_ACTIVE_CLASSES.forEach((className) => card.classList.toggle(className, isActive));
};

const closeDetails = () => {
    if (detailPanel) detailPanel.hidden = true;
    if (activeView) activeView.openDayIndex = null;

    weatherCardsDiv.querySelectorAll(".card-tombol").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
        setCardActive(button.closest(".card"), false);
    });
};

const openDetails = (index) => {
    if (!activeView || !detailPanel || !detailTitle || !detailList) return;

    const day = activeView.days[index];
    if (!day) return;

    detailTitle.textContent = `Rincian ${day.dayLabel}`;
    detailList.innerHTML = day.items.map((item) => {
        const main = (item && item.main) || {};
        const weather = (item && item.weather && item.weather[0]) || {};
        return `<li class="rounded-md bg-[#f4f1ff] px-3 py-2.5">
                    <span class="block text-[13px] font-semibold text-[#4a3f7a]">${formatTime(item && item.dt, activeView.timezone)}</span>
                    <span class="mt-0.5 block text-[16px] font-semibold text-[#212121]">${formatTemperature(main.temp)}</span>
                    <span class="block text-[12px] text-[#4d4d4d]">${escapeHtml(weather.description || "—")}</span>
                </li>`;
    }).join("");

    detailPanel.hidden = false;
    activeView.openDayIndex = index;

    // Di layar kecil panel bisa terbuka di bawah lipatan: gulirkan seperlunya.
    if (typeof detailPanel.getBoundingClientRect === "function"
        && typeof detailPanel.scrollIntoView === "function") {
        const rect = detailPanel.getBoundingClientRect();
        const viewportHeight = window.innerHeight
            || (document.documentElement ? document.documentElement.clientHeight : 0)
            || 0;
        if (viewportHeight > 0 && rect.bottom > viewportHeight) {
            detailPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    weatherCardsDiv.querySelectorAll(".card-tombol").forEach((button) => {
        const isOpen = toNumber(button.dataset.dayIndex) === index;
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        setCardActive(button.closest(".card"), isOpen);
    });
};

const toggleDetails = (index) => {
    if (!activeView) return;
    if (activeView.openDayIndex === index) closeDetails();
    else openDetails(index);
};

// ============================================================
// Perkiraan per jam (slot 3 jam dari endpoint forecast)
// ============================================================
const buildHourly = (list) => {
    const nowSeconds = Date.now() / 1000;
    return (Array.isArray(list) ? list : [])
        .filter((item) => {
            const dt = toNumber(item && item.dt);
            return Number.isFinite(dt) && dt >= nowSeconds - 3 * 3600;
        })
        .slice(0, 8);
};

const renderHourly = (view) => {
    if (!hourlyList) return;

    const hourly = Array.isArray(view && view.hourly) ? view.hourly : [];
    const timezone = view ? view.timezone : undefined;

    if (hourly.length === 0) {
        hourlyList.innerHTML = `<li class="text-[14px] text-slate-600 dark:text-slate-300">Data per jam belum tersedia.</li>`;
        return;
    }

    hourlyList.innerHTML = hourly.map((item) => {
        const { iconMarkup } = buildIcon(item, "hour");
        const chance = toNumber(item.pop);
        const pop = Number.isFinite(chance)
            ? `<span class="mt-1 text-[12px] font-semibold ${chance >= 0.5 ? "text-sky-700 dark:text-sky-300" : "text-slate-600 dark:text-slate-300"}">${Math.round(chance * 100)}%</span>`
            : "";
        return `<li class="flex w-[96px] shrink-0 flex-col items-center rounded-lg bg-white px-2 py-3 text-center shadow-sm dark:bg-slate-800">
                    <span class="text-[13px] font-semibold text-[#4a3f7a] dark:text-slate-300">${formatTime(item.dt, timezone)}</span>
                    ${iconMarkup}
                    <span class="text-[15px] font-semibold">${formatTemperature(item.main && item.main.temp)}</span>
                    ${pop}
                </li>`;
    }).join("");
};

// ============================================================
// Render & satuan
// ============================================================
const renderAll = (view, options = {}) => {
    if (!view) return;

    currentWeatherDiv.innerHTML = buildMainCard(view);
    weatherCardsDiv.innerHTML = view.days
        .map((day, index) => buildDayCard(view, day, index))
        .join("");

    if (forecastTitle) {
        forecastTitle.textContent = view.days.length > 0
            ? `Perkiraan ${view.days.length}-Hari Kedepan`
            : "Perkiraan Cuaca";
    }

    paintAirValue();
    paintUvValue();
    paintPollenValue();

    applySky(view);
    renderHourly(view);
    renderInsight(view);
    renderAlerts(view);
    renderFavoriteControls();
    syncRadarView(view);

    if (options.keepOpen && Number.isInteger(view.openDayIndex)) openDetails(view.openDayIndex);
    else closeDetails();
};

// Ganti satuan tanpa mengambil ulang data dari API.
const setUnits = (next, options = {}) => {
    units = next === "imperial" ? "imperial" : "metric";

    unitButtons.forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.unit === units ? "true" : "false");
    });

    writeStorage();
    if (options.rerender !== false && activeView) renderAll(activeView, { keepOpen: true });
};

// Muat kota/koordinat tertentu: satu jalur untuk "Coba lagi", auto-refresh,
// dan pemulihan preferensi.
const loadWeather = async (target) => {
    if (!target) return false;

    const token = ++activeRequest;
    setLoading(true);
    try {
        await getWeatherDetails(target.name, target.lat, target.lon, token);
        return true;
    } finally {
        if (!isStale(token)) setLoading(false);
    }
};

// Muat ulang kota terakhir yang berhasil tampil.
const reloadLast = () => (lastLocation ? loadWeather(lastLocation) : Promise.resolve(false));

// Mengambil kondisi saat ini + ramalan berdasarkan koordinat, lalu merendernya.
const getWeatherDetails = async (cityName, latitude, longitude, token) => {
    // Disimpan sebelum permintaan: bila gagal, "Coba lagi" mengulang kota ini.
    lastAttempt = { name: cityName, lat: latitude, lon: longitude };

    const FORECAST_API_URL = `https://api.openweathermap.org/data/2.5/forecast?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&lang=id&appid=${API_KEY}`;
    const CURRENT_API_URL = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&lang=id&appid=${API_KEY}`;

    // Kondisi saat ini diambil bersamaan dengan ramalan supaya tidak berurutan.
    // Bila gagal, null -> kartu besar memakai slot ramalan pertama.
    const currentPromise = requestJson(CURRENT_API_URL, { timeoutMs: CURRENT_TIMEOUT_MS }).catch((error) => {
        if (error && error.name === "AbortError") throw error;
        return null;
    });

    let data;
    try {
        data = await requestJson(FORECAST_API_URL, { timeoutMs: REQUEST_TIMEOUT_MS });
    } catch (error) {
        if (!isStale(token)) reportError("Terjadi kesalahan saat mengambil ramalan cuaca!", error);
        return;
    }

    if (isStale(token)) return;

    if (!Array.isArray(data && data.list) || data.list.length === 0) {
        showNotice("Data ramalan cuaca tidak tersedia untuk lokasi ini.", { kind: "gagal" });
        return;
    }

    // Offset zona waktu kota (detik dari UTC) untuk label tanggal.
    const forecastTimezone = data && data.city ? toNumber(data.city.timezone) : NaN;

    // Kelompokkan ramalan per tanggal waktu kota; tiap tanggal menyimpan
    // seluruh slot 3 jam untuk panel rincian.
    const groups = new Map();
    for (const item of data.list) {
        const timestamp = toNumber(item && item.dt);
        if (!Number.isFinite(timestamp)) continue;

        const label = formatDate(timestamp, forecastTimezone);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(item);
    }

    const groupedDays = [...groups.entries()].map(([dayLabel, items]) => ({
        dayLabel,
        item: items[0],
        items,
    }));

    if (groupedDays.length === 0) {
        showNotice("Data ramalan cuaca tidak tersedia untuk lokasi ini.", { kind: "gagal" });
        return;
    }

    const currentData = await currentPromise;
    if (isStale(token)) return;

    const hasCurrent = Boolean(currentData && currentData.main);
    const fallbackItem = groupedDays[0].item;
    const currentTimezone = hasCurrent ? toNumber(currentData.timezone) : NaN;
    const timezone = Number.isFinite(currentTimezone) && Math.abs(currentTimezone) <= MAX_TIMEZONE_OFFSET
        ? currentTimezone
        : forecastTimezone;
    const todayLabel = formatDate(hasCurrent ? currentData.dt : fallbackItem.dt, timezone);

    // Slot 24 jam pertama (8 x 3 jam) untuk daftar per jam.
    const hourly = buildHourly(data.list);

    // Tanggal hari ini tidak diulang sebagai kartu (sudah ada di kartu besar).
    const view = {
        // Nama yang dipilih pengguna lebih dipercaya daripada `name` dari
        // /weather: endpoint itu mengembalikan nama tempat TERDEKAT dari titik
        // koordinat (contoh: koordinat Bekasi bisa dilaporkan "Bulanbulan").
        cityName: String(cityName || "").trim()
            || (hasCurrent && currentData.name ? String(currentData.name) : DEFAULT_CITY_NAME),
        todayLabel,
        timezone,
        hourly,
        latitude,
        longitude,
        at: Date.now(),
        current: hasCurrent
            ? currentData
            : { main: fallbackItem.main, wind: fallbackItem.wind, weather: fallbackItem.weather },
        days: groupedDays
            .filter((day) => day.dayLabel !== todayLabel)
            .slice(0, MAX_FORECAST_DAYS - 1),
        openDayIndex: null,
    };

    if (view.days.length === 0) {
        showNotice("Data ramalan cuaca tidak tersedia untuk lokasi ini.", { kind: "gagal" });
        return;
    }

    // Baru sekarang kartu disentuh: bila salah satu pemeriksaan di atas
    // gagal, kartu lama tetap utuh dan tidak tertinggal di "Memuat…".
    // Nilai lama tidak boleh dipakai ringkasan untuk kota baru.
    environmentState = { aqi: null, uv: null };
    showAirQualityMessage("Memuat…");
    showUvMessage("Memuat…");
    showPollenMessage("Memuat…");
    activeView = view;
    cityInput.value = "";
    renderAll(view);
    hideNotice();

    lastLocation = {
        name: view.cityName,
        lat: toNumber(latitude),
        lon: toNumber(longitude),
        at: view.at,
    };
    writeStorage();
    renderFavoriteControls();

    // Tidak di-await: cuaca sudah tampil walau data tambahan masih dimuat.
    loadAirQuality(latitude, longitude, token);
    loadEnvironment(latitude, longitude, token);
};

// ============================================================
// Kualitas udara
// ============================================================

// Cadangan bila main.aqi tidak dikirim: tebak tingkat dari PM2.5 (µg/m³).
const aqiFromPm25 = (value) => {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value <= 15) return 1;
    if (value <= 35) return 2;
    if (value <= 55) return 3;
    if (value <= 150) return 4;
    return 5;
};

// Baris "Kualitas Udara" juga dipakai untuk pesan "memuat" dan "tidak tersedia".
const showAirQualityMessage = (message) => {
    airValueState = { text: message, tone: null, title: null };
    paintAirValue();
};

const renderAirQuality = (payload) => {
    const entry = payload && Array.isArray(payload.list) ? payload.list[0] : null;
    const main = entry && entry.main ? entry.main : {};
    const components = entry && entry.components && typeof entry.components === "object"
        ? entry.components
        : {};

    const rawAqi = toNumber(main.aqi);
    const pm25 = toNumber(components.pm2_5);

    // main.aqi sudah berupa skala 1-5; kalau tidak ada, pakai ambang PM2.5.
    const aqi = Number.isFinite(rawAqi) && rawAqi >= 1 && rawAqi <= 5
        ? Math.round(rawAqi)
        : aqiFromPm25(pm25);
    const level = aqi === null ? null : AIR_QUALITY_LEVELS[aqi];

    if (!level) {
        environmentState.aqi = null;
        refreshSummary();
        showAirQualityMessage("Tidak tersedia");
        return;
    }

    environmentState.aqi = aqi;
    refreshSummary();

    // Angka AQI dan penjelasannya tetap terbaca lewat tooltip.
    airValueState = {
        text: level.label,
        tone: level.tone,
        title: `AQI ${aqi} dari 5 · ${level.verdict}`,
    };
    paintAirValue();
};

// Dimuat terpisah dari cuaca supaya kegagalannya tidak menghalangi ramalan.
const loadAirQuality = async (latitude, longitude, token) => {
    const AIR_API_URL = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&appid=${API_KEY}`;

    try {
        const data = await requestJson(AIR_API_URL, { timeoutMs: REQUEST_TIMEOUT_MS });
        if (isStale(token)) return;
        renderAirQuality(data);
    } catch (error) {
        if (isStale(token)) return;
        environmentState.aqi = null;
        refreshSummary();
        showAirQualityMessage("Tidak tersedia");
    }
};

// ============================================================
// Indeks UV & polen
// ============================================================

const showUvMessage = (message, title = null) => {
    uvValueState = { text: message, tone: null, title };
    paintUvValue();
};

const showPollenMessage = (message, title = null) => {
    pollenValueState = { text: message, tone: null, title };
    paintPollenValue();
};

// Tingkat pertama yang belum terlampaui nilainya.
const levelFor = (levels, value) => levels.find((level) => value <= level.max) || levels[levels.length - 1];

const renderUvIndex = (payload) => {
    // Endpoint /uvi mengirim { value }; versi lama mengirim { data }.
    const raw = payload && typeof payload === "object"
        ? (payload.value !== undefined ? payload.value : payload.data)
        : payload;
    const value = toNumber(raw);

    if (!Number.isFinite(value) || value < 0) {
        environmentState.uv = null;
        refreshSummary();
        showUvMessage("Tidak tersedia");
        return;
    }

    environmentState.uv = value;
    refreshSummary();

    const level = levelFor(UV_LEVELS, value);
    const rounded = Math.round(value * 10) / 10;

    // "13.3 (Ekstrem)" tanpa angka mentah yang panjang.
    uvValueState = {
        text: `${rounded} (${level.label})`,
        tone: level.tone,
        title: `Indeks UV ${rounded} · ${level.verdict}`,
    };
    paintUvValue();
};

const renderPollen = (payload) => {
    const current = payload && payload.current && typeof payload.current === "object"
        ? payload.current
        : null;

    // null berarti wilayah itu di luar cakupan data (mis. Indonesia).
    const readings = POLLEN_TYPES
        .map((type) => ({ ...type, value: toNumber(current ? current[type.key] : NaN) }))
        .filter((type) => Number.isFinite(type.value) && type.value >= 0);

    if (readings.length === 0) {
        showPollenMessage("Tidak tersedia", "Data polen baru tersedia untuk Eropa (sumber CAMS via Open-Meteo).");
        return;
    }

    const highest = readings.reduce((worst, type) => (type.value > worst.value ? type : worst));
    const level = levelFor(POLLEN_LEVELS, highest.value);

    pollenValueState = {
        text: level.label,
        tone: level.tone,
        title: `Tertinggi: ${highest.label} ${Math.round(highest.value)} butir/m³ · ambang perkiraan, bukan angka resmi`,
    };
    paintPollenValue();
};

// UV dari OpenWeatherMap, polen dari Open-Meteo (gratis, tanpa API key).
// Dimuat terpisah dari cuaca supaya kegagalan salah satu tidak menghalangi
// ramalan maupun nilai tambahan lainnya.
const loadEnvironment = async (latitude, longitude, token) => {
    const UV_API_URL = `https://api.openweathermap.org/data/2.5/uvi?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&appid=${API_KEY}`;
    const pollenKeys = POLLEN_TYPES.map((type) => type.key).join(",");
    const POLLEN_API_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=${pollenKeys}&timezone=auto`;

    const [uvResult, pollenResult] = await Promise.allSettled([
        requestJson(UV_API_URL, { timeoutMs: REQUEST_TIMEOUT_MS }),
        requestJson(POLLEN_API_URL, { timeoutMs: REQUEST_TIMEOUT_MS }),
    ]);

    if (isStale(token)) return;

    if (uvResult.status === "fulfilled") renderUvIndex(uvResult.value);
    else {
        environmentState.uv = null;
        refreshSummary();
        showUvMessage("Tidak tersedia");
    }

    if (pollenResult.status === "fulfilled") renderPollen(pollenResult.value);
    else showPollenMessage("Tidak tersedia");
};

// ============================================================
// Ringkasan & saran
// ============================================================
// Warna teks baris ringkasan; kelas Tailwind harus tertulis utuh.
const INSIGHT_TONE_CLASSES = {
    hijau: "text-emerald-700 dark:text-emerald-300",
    kuning: "text-amber-700 dark:text-amber-300",
    oranye: "text-orange-700 dark:text-orange-300",
    merah: "text-red-700 dark:text-red-300",
    ungu: "text-fuchsia-700 dark:text-fuchsia-300",
    netral: "text-slate-900 dark:text-slate-100",
};

// Dipanggil lagi saat AQI/UV menyusul datang.
const refreshSummary = () => {
    if (!activeView) return;
    renderInsight(activeView);
    renderAlerts(activeView);
};

const renderInsight = (view) => {
    const target = view || activeView;

    if (insightText) {
        insightText.textContent = buildInsightSentence(target) || "Ringkasan cuaca belum tersedia.";
    }
    if (!insightList) return;

    insightList.innerHTML = buildAdviceLines(target).map((line) => `<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-[#f7f5ff] px-3 py-2 dark:bg-slate-700/40">
                <span class="w-[132px] shrink-0 text-[13px] font-semibold uppercase tracking-wide text-[#4a3f7a] dark:text-slate-300">${escapeHtml(line.label)}</span>
                <span class="flex-1 text-[14px] font-medium leading-snug ${INSIGHT_TONE_CLASSES[line.tone] || INSIGHT_TONE_CLASSES.netral}">${escapeHtml(line.value)}</span>
            </li>`).join("");
};

const renderAlerts = (view) => {
    if (!alertBox) return;

    const alerts = computeAlerts(view || activeView);
    if (alerts.length === 0) {
        alertBox.hidden = true;
        alertBox.removeAttribute("data-tingkat");
        if (alertTitle) alertTitle.textContent = "";
        if (alertText) alertText.textContent = "";
        return;
    }

    const [first] = alerts;
    alertBox.hidden = false;
    alertBox.setAttribute("data-tingkat", first.level);
    if (alertTitle) alertTitle.textContent = first.title;
    if (alertText) {
        alertText.textContent = alerts.length > 1
            ? `${first.text} (+${alerts.length - 1} peringatan lain di Ringkasan & Saran.)`
            : first.text;
    }
};

// ============================================================
// Kota favorit
// ============================================================
const FAVORITES_LIMIT = 8;
let favorites = [];

const sanitizeFavorite = (entry) => {
    if (!entry || typeof entry !== "object") return null;
    const lat = toNumber(entry.lat);
    const lon = toNumber(entry.lon);
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (name === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { name, lat, lon };
};

// Jarak 0,01 derajat (~1 km) dianggap kota yang sama.
const isSamePlace = (a, b) => Boolean(a && b
    && Math.abs(toNumber(a.lat) - toNumber(b.lat)) < 0.01
    && Math.abs(toNumber(a.lon) - toNumber(b.lon)) < 0.01);

const isFavorite = (place) => favorites.some((item) => isSamePlace(item, place));

const addFavorite = (place) => {
    const clean = sanitizeFavorite(place);
    if (!clean) return;

    if (isFavorite(clean)) {
        showNotice(`${clean.name} sudah ada di daftar favorit.`, { kind: "info" });
        return;
    }
    if (favorites.length >= FAVORITES_LIMIT) {
        showNotice(`Daftar favorit penuh (maksimal ${FAVORITES_LIMIT} kota). Hapus salah satu dulu.`, { kind: "info" });
        return;
    }

    favorites = favorites.concat(clean);
    renderFavorites();
    renderFavoriteControls();
    writeStorage();
};

const removeFavorite = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= favorites.length) return;
    favorites = favorites.filter((_, position) => position !== index);
    renderFavorites();
    renderFavoriteControls();
    writeStorage();
};

const renderFavoriteControls = () => {
    if (!favoriteSave) return;
    const already = lastLocation ? isFavorite(lastLocation) : false;
    favoriteSave.disabled = !lastLocation || already;
    favoriteSave.textContent = already ? "★ Tersimpan di favorit" : "☆ Simpan kota ini";
};

const renderFavorites = () => {
    if (!favoritesList) return;

    favoritesList.innerHTML = favorites.map((item, index) => `<li class="flex items-center gap-2 rounded-md border border-[#d6d0ea] bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800">
                <button type="button" class="min-w-0 flex-1 cursor-pointer truncate rounded bg-transparent px-1 py-1 text-left text-[14px] font-semibold text-[#4a3f7a] hover:text-brand focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#212121] dark:text-slate-200" data-favorit="${index}">${escapeHtml(item.name)}</button>
                <button type="button" class="cursor-pointer rounded px-1.5 py-0.5 text-[16px] leading-none text-[#7a2f00] hover:text-red-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#212121] dark:text-amber-200" data-hapus="${index}" aria-label="Hapus ${escapeHtml(item.name)} dari favorit">&times;</button>
            </li>`).join("");

    if (favoriteEmpty) favoriteEmpty.hidden = favorites.length > 0;
};

// ============================================================
// Peta radar hujan (RainViewer + Leaflet)
// ============================================================
const RADAR_API_URL = "https://api.rainviewer.com/public/weather-maps.json";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const RADAR_FRAME_COUNT = 6;

let leafletPromise = null;
const radarState = {
    map: null,
    layer: null,
    frames: [],
    index: 0,
    timer: null,
};

const setRadarStatus = (message) => {
    if (radarStatus) radarStatus.textContent = message;
};

// Leaflet baru diunduh saat pengguna benar-benar membuka peta.
const loadLeaflet = () => {
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
        if (window.L && typeof window.L.map === "function") {
            resolve(window.L);
            return;
        }
        if (typeof document === "undefined" || !document.head) {
            reject(new Error("Peta tidak dapat dimuat di lingkungan ini."));
            return;
        }

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS_URL;
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = LEAFLET_JS_URL;
        script.async = true;
        script.onload = () => {
            if (window.L && typeof window.L.map === "function") resolve(window.L);
            else reject(new Error("Pustaka peta gagal dimuat."));
        };
        script.onerror = () => reject(new Error("Pustaka peta gagal dimuat. Periksa koneksi internet."));
        document.head.appendChild(script);
    });

    return leafletPromise;
};

const buildRadarTileUrl = (path) => `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`;

const pickRadarFrames = (payload) => {
    const frames = payload && payload.radar && Array.isArray(payload.radar.past) ? payload.radar.past : [];
    return frames
        .filter((frame) => frame && typeof frame.path === "string" && frame.path.startsWith("/"))
        .slice(-RADAR_FRAME_COUNT);
};

const setRadarFrame = (index) => {
    const L = window.L;
    if (!radarState.map || !L || radarState.frames.length === 0) return;

    const frame = radarState.frames[index];
    if (!frame) return;
    radarState.index = index;

    if (radarState.layer && typeof radarState.map.removeLayer === "function") {
        radarState.map.removeLayer(radarState.layer);
    }
    radarState.layer = L.tileLayer(buildRadarTileUrl(frame.path), {
        opacity: 0.7,
        attribution: 'Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>',
    }).addTo(radarState.map);

    const stamp = toNumber(frame.time);
    const label = Number.isFinite(stamp)
        ? new Date(stamp * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
        : "";
    setRadarStatus(label === ""
        ? "Radar hujan terbaru."
        : `Radar hujan pukul ${label} (waktu server RainViewer).`);
};

const stopRadarPlay = () => {
    if (radarState.timer) {
        window.clearInterval(radarState.timer);
        radarState.timer = null;
    }
    if (radarPlay) {
        radarPlay.setAttribute("aria-pressed", "false");
        radarPlay.textContent = "Putar";
    }
};

const stepRadar = () => {
    if (radarState.frames.length === 0) return;
    setRadarFrame((radarState.index + 1) % radarState.frames.length);
};

const toggleRadarPlay = () => {
    if (radarState.timer) {
        stopRadarPlay();
        return;
    }
    if (radarState.frames.length < 2 || typeof window.setInterval !== "function") return;

    radarState.timer = window.setInterval(stepRadar, 900);
    if (radarPlay) {
        radarPlay.setAttribute("aria-pressed", "true");
        radarPlay.textContent = "Jeda";
    }
};

const showRadar = async () => {
    if (!radarMap) return;

    if (radarToggle) radarToggle.disabled = true;
    setRadarStatus("Memuat peta radar…");

    try {
        const L = await loadLeaflet();
        const view = activeView;
        const latitude = toNumber(view && view.latitude);
        const longitude = toNumber(view && view.longitude);
        const center = Number.isFinite(latitude) && Number.isFinite(longitude)
            ? [latitude, longitude]
            : [DEFAULT_CITY.lat, DEFAULT_CITY.lon];

        radarMap.hidden = false;

        if (!radarState.map) {
            radarState.map = L.map(radarMap, { scrollWheelZoom: false }).setView(center, 8);
            L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 18 }).addTo(radarState.map);
        }

        const payload = await requestJson(RADAR_API_URL, { timeoutMs: REQUEST_TIMEOUT_MS });
        const frames = pickRadarFrames(payload);

        if (frames.length === 0) {
            setRadarStatus("Data radar hujan sedang tidak tersedia. Coba lagi beberapa saat lagi.");
            return;
        }

        radarState.frames = frames;
        setRadarFrame(frames.length - 1);
        if (radarPlay) radarPlay.hidden = frames.length < 2;
        syncRadarView(view);
    } catch (error) {
        console.error("Gagal memuat peta radar:", error);
        setRadarStatus(error && error.message ? error.message : "Peta radar gagal dimuat.");
        radarMap.hidden = true;
    } finally {
        if (radarToggle) radarToggle.disabled = false;
    }
};

const toggleRadarPanel = () => {
    if (!radarMap) return;

    if (radarMap.hidden) showRadar();
    else {
        radarMap.hidden = true;
        stopRadarPlay();
        if (radarPlay) radarPlay.hidden = true;
        setRadarStatus("Peta disembunyikan. Tekan “Tampilkan peta” untuk membuka lagi.");
    }
};

const syncRadarView = (view) => {
    if (!radarState.map || !view) return;
    if (typeof radarState.map.setView !== "function") return;

    const latitude = toNumber(view.latitude);
    const longitude = toNumber(view.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    radarState.map.setView([latitude, longitude], radarState.map.getZoom() || 8);
};

// ============================================================
// Lokasi otomatis saat halaman pertama dibuka
// ============================================================
const DEFAULT_CITY = { name: "Jakarta", lat: -6.2088, lon: 106.8456 };

// Dipakai saat geolokasi otomatis ditolak atau tidak didukung.
const loadDefaultCity = async (message) => {
    // Banner info baru ditampilkan SETELAH cuaca berhasil dimuat, karena
    // getWeatherDetails menghapus banner lama begitu render sukses.
    const loaded = await loadWeather({ ...DEFAULT_CITY, at: Date.now() }).catch(() => false);
    if (loaded && message) showNotice(message, { kind: "info" });
    return loaded;
};

// ============================================================
// Autocomplete kota
// ============================================================
// "Bandung" bisa merujuk ke kota di Indonesia atau di negara lain, jadi
// pencarian mengambil beberapa kandidat (limit=5) dan pengguna memilih.

let suggestions = [];
let activeSuggestionIndex = -1;
let suggestionRequest = 0;
let suggestionTimer = null;
let suggestionController = null;

const isSuggestionOpen = () => Boolean(suggestionList) && !suggestionList.hidden;

const setSuggestionStatus = (text) => {
    if (suggestionStatus) suggestionStatus.textContent = text;
};

// Satu baris hasil geocoding -> entri saran yang sudah divalidasi.
const toSuggestion = (entry) => {
    if (!entry || typeof entry !== "object") return null;

    const latitude = toNumber(entry.lat);
    const longitude = toNumber(entry.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (name === "") return null;

    const state = typeof entry.state === "string" ? entry.state.trim() : "";
    const country = typeof entry.country === "string" ? entry.country.trim() : "";

    return {
        name,
        label: [name, state, country].filter(Boolean).join(", "),
        latitude,
        longitude,
    };
};

// Buang entri rusak dan duplikat (label + koordinat sama).
const normalizeSuggestions = (data) => {
    if (!Array.isArray(data)) return [];

    const seen = new Set();
    const entries = [];
    for (const raw of data) {
        const entry = toSuggestion(raw);
        if (!entry) continue;

        const key = `${entry.label}|${entry.latitude}|${entry.longitude}`;
        if (seen.has(key)) continue;

        seen.add(key);
        entries.push(entry);
        if (entries.length === SUGGESTION_LIMIT) break;
    }
    return entries;
};

// Hentikan pencarian saran yang masih tertunda atau berjalan. Tanpa ini,
// respons yang datang setelah daftar ditutup akan membukanya lagi.
const cancelSuggestionLookup = () => {
    if (suggestionTimer !== null) {
        clearTimeout(suggestionTimer);
        suggestionTimer = null;
    }
    suggestionRequest += 1;
    if (suggestionController) {
        suggestionController.abort();
        suggestionController = null;
    }
};

const closeSuggestions = () => {
    cancelSuggestionLookup();
    suggestions = [];
    activeSuggestionIndex = -1;
    if (suggestionList) {
        suggestionList.hidden = true;
        suggestionList.innerHTML = "";
    }
    cityInput.setAttribute("aria-expanded", "false");
    cityInput.removeAttribute("aria-activedescendant");
};

const highlightSuggestion = (index) => {
    if (!suggestionList || suggestions.length === 0) return;

    activeSuggestionIndex = index;
    const options = suggestionList.querySelectorAll("li[data-index]");
    options.forEach((option, optionIndex) => {
        const isActive = optionIndex === index;
        option.setAttribute("aria-selected", isActive ? "true" : "false");
        if (isActive) {
            cityInput.setAttribute("aria-activedescendant", option.id);
            option.scrollIntoView({ block: "nearest" });
        }
    });
};

// Tampilkan daftar saran, atau satu baris status bila kosong.
const renderSuggestions = (entries, emptyMessage) => {
    if (!suggestionList) return;

    suggestions = entries;
    activeSuggestionIndex = -1;
    // Atribut tidak boleh menunjuk id saran lama yang sudah tidak ada.
    cityInput.removeAttribute("aria-activedescendant");

    if (entries.length === 0) {
        const message = emptyMessage || "Kota tidak ditemukan.";
        suggestionList.innerHTML = `<li class="cursor-default px-4 py-3 text-[14px] text-[#5f5f5f] hover:bg-transparent" role="option" aria-disabled="true">${escapeHtml(message)}</li>`;
        setSuggestionStatus(message);
    } else {
        suggestionList.innerHTML = entries.map((entry, index) => `
            <li id="saran-${index}" data-index="${index}" role="option" aria-selected="false"
                class="cursor-pointer border-b border-[#f0edf8] px-4 py-3 text-[15px] text-[#212121] last:border-b-0 hover:bg-[#efe9ff] aria-selected:bg-[#efe9ff]">
                ${escapeHtml(entry.label)}
            </li>`).join("");
        setSuggestionStatus(`${entries.length} kota ditemukan. Gunakan panah atas atau bawah lalu Enter untuk memilih.`);
    }

    suggestionList.hidden = false;
    cityInput.setAttribute("aria-expanded", "true");
};

// Geocoding kota. Signal dipakai agar permintaan lama bisa dibatalkan.
const lookupCities = async (query, signal) => {
    const API_URL = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=${SUGGESTION_LIMIT}&appid=${API_KEY}`;
    const options = { timeoutMs: REQUEST_TIMEOUT_MS };
    if (signal) options.signal = signal;

    const data = await requestJson(API_URL, options);
    return normalizeSuggestions(data);
};

const requestSuggestions = async (query) => {
    const token = ++suggestionRequest;

    // Permintaan sebelumnya dibatalkan: pengguna sudah mengetik lagi.
    if (suggestionController) suggestionController.abort();
    suggestionController = typeof AbortController === "function" ? new AbortController() : null;

    try {
        const entries = await lookupCities(query, suggestionController ? suggestionController.signal : null);
        if (token !== suggestionRequest) return; // hasil basi
        renderSuggestions(entries, `Tidak ada kota bernama "${query}"`);
    } catch (error) {
        if (token !== suggestionRequest) return;
        if (error && error.name === "AbortError") return;
        // Saran gagal dimuat bukan alasan memblokir pengguna dengan alert.
        renderSuggestions([], "Saran kota tidak dapat dimuat.");
    }
};

// Pengguna memilih satu kota: pakai koordinatnya langsung, tanpa geocoding ulang.
const selectSuggestion = async (index) => {
    const choice = suggestions[index];
    if (!choice) return;

    closeSuggestions();
    cityInput.value = choice.label;

    const token = ++activeRequest;
    setLoading(true);
    try {
        await getWeatherDetails(choice.name, choice.latitude, choice.longitude, token);
    } finally {
        if (!isStale(token)) setLoading(false);
    }
};

// Mencari koordinat dari nama kota yang diketik pengguna.
const getCityCoordinates = async () => {
    const cityName = cityInput.value.trim();
    if (cityName === "") {
        cityInput.focus();
        return;
    }

    closeSuggestions();

    const token = ++activeRequest;
    setLoading(true);

    try {
        const entries = await lookupCities(cityName, null);
        if (isStale(token)) return;

        // Harus berhenti di sini: kalau lanjut, kandidat kosong -> undefined.
        if (entries.length === 0) {
            showNotice(`Tidak ditemukan koordinat untuk ${cityName}. Periksa ejaan nama kota.`, {
                kind: "gagal",
                retry: getCityCoordinates,
            });
            return;
        }

        // Nama kota tidak unik: kalau ada beberapa kandidat, biarkan
        // pengguna memilih daripada menebak yang pertama.
        if (entries.length > 1) {
            renderSuggestions(entries, "");
            return;
        }

        const [only] = entries;
        await getWeatherDetails(only.name, only.latitude, only.longitude, token);
    } catch (error) {
        if (isStale(token)) return;
        reportError("Terjadi kesalahan saat mengambil koordinat!", error, getCityCoordinates);
    } finally {
        if (!isStale(token)) setLoading(false);
    }
};

// Promise wrapper untuk API geolokasi.
const getCurrentPosition = () => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000, // posisi cache maksimal 5 menit
    });
});

const describeGeoError = (error) => {
    switch (error && error.code) {
        case 1: // PERMISSION_DENIED
            return "Permintaan geolokasi ditolak. Harap setel ulang izin lokasi untuk memberikan akses lagi.";
        case 2: // POSITION_UNAVAILABLE
            return "Lokasi perangkat tidak tersedia. Silakan cari nama kota secara manual.";
        case 3: // TIMEOUT
            return "Waktu permintaan lokasi habis. Silakan coba lagi.";
        default:
            return "Kesalahan permintaan geolokasi. Harap setel ulang izin lokasi.";
    }
};

// Mengambil koordinat perangkat lalu menampilkan cuacanya.
const getUserCoordinates = async (options = {}) => {
    // Cek dukungan sebelum menaikkan token: kalau peramban tidak mendukung,
    // permintaan lain yang sedang berjalan tetap berhak mereset tombol.
    if (!navigator.geolocation) {
        if (options.auto) {
            loadDefaultCity(`Peramban ini tidak mendukung geolokasi. Menampilkan cuaca ${DEFAULT_CITY.name}.`);
            return;
        }
        showNotice("Peramban ini tidak mendukung geolokasi. Silakan cari nama kota secara manual.", {
            kind: "gagal",
        });
        return;
    }

    const token = ++activeRequest;
    setLoading(true);
    try {
        const position = await getCurrentPosition();
        if (isStale(token)) return;

        const coords = (position && position.coords) || {};
        const latitude = toNumber(coords.latitude);
        const longitude = toNumber(coords.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            showNotice("Koordinat perangkat tidak valid. Silakan cari nama kota secara manual.", {
                kind: "gagal",
                retry: getUserCoordinates,
            });
            return;
        }
        const API_URL = `https://api.openweathermap.org/geo/1.0/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&limit=1&appid=${API_KEY}`;

        // Nama kota hanya pelengkap: kalau gagal/kosong, cuaca tetap ditampilkan
        // berdasarkan koordinat.
        let cityName = DEFAULT_CITY_NAME;
        try {
            const data = await requestJson(API_URL, { timeoutMs: REQUEST_TIMEOUT_MS });
            const name = Array.isArray(data) && data[0] ? data[0].name : "";
            if (typeof name === "string" && name.trim() !== "") {
                cityName = name;
            }
        } catch (error) {
            console.warn("Gagal mengambil nama kota:", error);
        }

        if (isStale(token)) return;
        await getWeatherDetails(cityName, latitude, longitude, token);
    } catch (error) {
        if (isStale(token)) return;
        console.error("Kesalahan permintaan geolokasi:", error);
        // Saat dibuka otomatis, jangan menyodorkan banner galat ke pengguna
        // baru: tampilkan kota default saja.
        if (options.auto) {
            loadDefaultCity(`${describeGeoError(error)} Menampilkan cuaca ${DEFAULT_CITY.name}.`);
            return;
        }
        showNotice(describeGeoError(error), { kind: "gagal", retry: getUserCoordinates });
    } finally {
        if (!isStale(token)) setLoading(false);
    }
};

// Event listener tombol dan input.
locationButton.addEventListener("click", () => getUserCoordinates());

// Tema: tombol manual; selama belum ada pilihan manual, ikuti sistem.
if (themeButton) themeButton.addEventListener("click", toggleTheme);
if (systemThemeQuery && typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", () => {
        if (!themePreference) applyTheme();
    });
}

// Favorit: simpan kota yang sedang tampil, buka atau hapus dari daftar.
if (favoriteSave) favoriteSave.addEventListener("click", () => addFavorite(lastLocation));
if (favoritesList) {
    favoritesList.addEventListener("click", (event) => {
        const target = event.target && typeof event.target.closest === "function" ? event.target : null;
        if (!target) return;

        const removeButton = target.closest("[data-hapus]");
        if (removeButton) {
            removeFavorite(toNumber(removeButton.dataset.hapus));
            return;
        }

        const openButton = target.closest("[data-favorit]");
        if (openButton) {
            const favorite = favorites[toNumber(openButton.dataset.favorit)];
            if (favorite) {
                cityInput.value = "";
                loadWeather(favorite);
            }
        }
    });
}

// Peta radar: dimuat hanya saat tombol ditekan.
if (radarToggle) radarToggle.addEventListener("click", toggleRadarPanel);
if (radarPlay) radarPlay.addEventListener("click", toggleRadarPlay);

searchButton.addEventListener("click", () => {
    // Kalau ada saran yang sedang disorot, tombol Search memilih saran itu
    // alih-alih mengulang pencarian teks.
    if (isSuggestionOpen() && activeSuggestionIndex >= 0) {
        selectSuggestion(activeSuggestionIndex);
        return;
    }
    getCityCoordinates();
});

// Saran muncul saat mengetik, dengan jeda supaya API tidak dipanggil
// pada setiap ketukan tombol.
cityInput.addEventListener("input", () => {
    const query = cityInput.value.trim();
    clearTimeout(suggestionTimer);

    if (query.length < SUGGESTION_MIN_LENGTH) {
        suggestionRequest++; // hasil yang masih di jalan tidak boleh menimpa
        if (suggestionController) suggestionController.abort();
        closeSuggestions();
        return;
    }

    suggestionTimer = setTimeout(() => requestSuggestions(query), SUGGESTION_DEBOUNCE_MS);
});

// keydown (bukan keyup) agar Enter tidak memicu pencarian berulang saat
// tombol ditahan, dan isComposing dihormati untuk input IME.
cityInput.addEventListener("keydown", (event) => {
    if (event.isComposing) return;

    const navigationKeys = event.key === "ArrowDown" || event.key === "ArrowUp";
    if (isSuggestionOpen() && navigationKeys && suggestions.length > 0) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        // Berputar: dari bawah kembali ke atas, dan sebaliknya.
        const nextIndex = (activeSuggestionIndex + direction + suggestions.length) % suggestions.length;
        highlightSuggestion(nextIndex);
        return;
    }

    if (event.key === "Escape" && isSuggestionOpen()) {
        event.preventDefault();
        closeSuggestions();
        return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (isSuggestionOpen() && activeSuggestionIndex >= 0) {
        selectSuggestion(activeSuggestionIndex);
        return;
    }
    getCityCoordinates();
});

if (suggestionList) {
    // mousedown + preventDefault: input tidak kehilangan fokus sebelum
    // pilihan diproses, jadi daftar tidak sempat tertutup lebih dulu.
    suggestionList.addEventListener("mousedown", (event) => {
        const option = event.target && event.target.closest
            ? event.target.closest("li[data-index]")
            : null;
        if (!option) return;

        event.preventDefault();
        selectSuggestion(Number(option.dataset.index));
    });

    suggestionList.addEventListener("mousemove", (event) => {
        const option = event.target && event.target.closest
            ? event.target.closest("li[data-index]")
            : null;
        if (!option) return;

        const index = Number(option.dataset.index);
        if (index !== activeSuggestionIndex) highlightSuggestion(index);
    });
}

// Klik di luar kolom pencarian menutup daftar saran.
document.addEventListener("click", (event) => {
    if (!isSuggestionOpen()) return;

    const target = event.target;
    if (target && typeof target.closest === "function" && target.closest(".kolom-cari")) return;
    closeSuggestions();
});

cityInput.addEventListener("blur", (event) => {
    const next = event ? event.relatedTarget : null;

    // Klik tombol Search membuat input kehilangan fokus lebih dulu; kalau
    // daftar langsung ditutup, saran yang sudah disorot ikut hilang sebelum
    // klik sempat memprosesnya. Jadi biarkan terbuka bila fokus pindah ke
    // tombol itu atau ke elemen di dalam kolom pencarian.
    if (next && typeof next.closest === "function" && (next === searchButton || next.closest(".kolom-cari"))) return;

    closeSuggestions();
});

// ============================================================
// Satuan, rincian harian, pesan, dan penyegaran otomatis
// ============================================================

// Tombol satuan °C/m/s atau °F/mph.
unitButtons.forEach((button) => {
    button.addEventListener("click", () => setUnits(button.dataset.unit));
});

// Klik kartu hari membuka/menutup rincian per 3 jam.
weatherCardsDiv.addEventListener("click", (event) => {
    const target = event.target;
    const button = target && typeof target.closest === "function"
        ? target.closest(".card-tombol")
        : null;
    if (!button) return;

    toggleDetails(toNumber(button.dataset.dayIndex));
});

if (detailClose) detailClose.addEventListener("click", closeDetails);

// Escape menutup panel rincian lebih dulu sebelum hal lain.
document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Handler input sudah menutup daftar saran; jangan ikut menutup rincian.
    if (event.defaultPrevented) return;
    if (!detailPanel || detailPanel.hidden) return;

    event.preventDefault();
    closeDetails();
});

if (noticeClose) noticeClose.addEventListener("click", hideNotice);

if (noticeRetry) {
    noticeRetry.addEventListener("click", () => {
        const action = noticeRetryAction;
        hideNotice();
        if (typeof action === "function") action();
    });
}

// Segarkan otomatis saat tab kembali aktif setelah 10 menit.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!lastLocation || !activeView) return;
    if (Date.now() - toNumber(lastLocation.at) < REFRESH_INTERVAL_MS) return;

    reloadLast();
});

window.addEventListener("online", () => {
    hideNotice();
    if (lastLocation) reloadLast();
});

window.addEventListener("offline", () => {
    showNotice("Koneksi internet terputus. Data yang tampil mungkin sudah lama.", {
        kind: "gagal",
        // Tanpa data yang bisa dimuat ulang, tombol "Coba lagi" tidak berguna.
        retry: lastLocation ? () => reloadLast() : null,
    });
});

// Pulihkan tema, satuan, kota terakhir, dan favorit dari localStorage.
const restorePreferences = () => {
    const saved = readStorage() || {};

    themePreference = saved.theme === "dark" || saved.theme === "light" ? saved.theme : null;
    applyTheme();

    favorites = Array.isArray(saved.favorites)
        ? saved.favorites.map(sanitizeFavorite).filter(Boolean).slice(0, FAVORITES_LIMIT)
        : [];

    // Kota dipulihkan lebih dulu supaya setUnits() tidak menimpa simpanan
    // kota dengan null saat menulis ulang preferensi.
    const city = saved.city;
    const latitude = city ? toNumber(city.lat) : NaN;
    const longitude = city ? toNumber(city.lon) : NaN;
    const hasCity = Boolean(city) && Number.isFinite(latitude) && Number.isFinite(longitude)
        && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

    if (hasCity) {
        lastLocation = {
            name: typeof city.name === "string" && city.name.trim() !== "" ? city.name : DEFAULT_CITY_NAME,
            lat: latitude,
            lon: longitude,
            at: 0, // 0 = belum ada data, jadi kunjungan berikutnya memuat ulang
        };
    }

    if (saved.units === "imperial") setUnits("imperial", { rerender: false });

    renderFavorites();
    if (hasCity) reloadLast();
};

// Kunjungan pertama tanpa kota tersimpan: coba deteksi lokasi otomatis sekali.
// Kalau ditolak, halaman tidak dibiarkan kosong.
const startWithLocation = () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
        getUserCoordinates({ auto: true });
        return;
    }
    loadDefaultCity(`Peramban ini tidak mendukung geolokasi. Menampilkan cuaca ${DEFAULT_CITY.name}.`);
};

restorePreferences();
if (!lastLocation) startWithLocation();