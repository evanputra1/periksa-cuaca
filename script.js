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
// Kartu cuaca utama digambar ulang tiap pencarian, jadi teks kualitas udara
// disimpan di state dan baru ditempel ke <span> hasil render terbaru.
let airValueState = { text: "__", tone: null, title: null };

const AIR_VALUE_CLASSES = "font-semibold data-[tone=hijau]:text-aqi-hijau data-[tone=kuning]:text-aqi-kuning data-[tone=oranye]:text-aqi-oranye data-[tone=merah]:text-aqi-merah data-[tone=ungu]:text-aqi-ungu";

const airValueMarkup = () => {
    const tone = airValueState.tone ? ` data-tone="${escapeHtml(airValueState.tone)}"` : "";
    const title = airValueState.title ? ` title="${escapeHtml(airValueState.title)}"` : "";
    return `<span class="${AIR_VALUE_CLASSES}" id="nilai-udara"${tone}${title}>${escapeHtml(airValueState.text)}</span>`;
};

const paintAirValue = () => {
    const node = document.querySelector("#nilai-udara");
    if (!node) return;

    node.textContent = airValueState.text;

    if (airValueState.tone) node.setAttribute("data-tone", airValueState.tone);
    else node.removeAttribute("data-tone");

    if (airValueState.title) node.setAttribute("title", airValueState.title);
    else node.removeAttribute("title");
};
const suggestionStatus = document.querySelector("#status-saran");
const updatedLabel = document.querySelector("#diperbarui");
const notice = document.querySelector("#pesan");
const noticeText = document.querySelector("#pesan-teks");
const noticeRetry = document.querySelector("#pesan-coba");
const noticeClose = document.querySelector("#pesan-tutup");
const unitButtons = Array.from(document.querySelectorAll(".satuan-btn"));
const detailPanel = document.querySelector("#rincian");
const detailTitle = document.querySelector("#rincian-judul");
const detailList = document.querySelector("#rincian-daftar");
const detailClose = document.querySelector("#rincian-tutup");

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
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ units, city: lastLocation }));
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

// "12 menit lalu" untuk penanda kapan data terakhir diambil.
const formatRelative = (timestamp) => {
    const value = toNumber(timestamp);
    if (!Number.isFinite(value)) return "";

    const minutes = Math.max(0, Math.round((Date.now() - value) / 60000));
    if (minutes < 1) return "baru saja";
    if (minutes < 60) return `${minutes} menit lalu`;
    return `${Math.round(minutes / 60)} jam lalu`;
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

// Kartu besar: kondisi cuaca SAAT INI (endpoint /weather).
const buildMainCard = (view) => {
    const current = view.current || {};
    const main = current.main || {};
    const wind = current.wind || {};
    const { description, iconMarkup } = buildIcon(current, "main");
    const line = "mt-3 text-[16px] font-medium";

    return `<div>
                <h2 class="text-[28px] font-bold max-[750px]:text-[1.35rem]">${escapeHtml(view.cityName)} (${escapeHtml(view.todayLabel)})</h2>
                <h6 class="${line}">Suhu: ${formatTemperature(main.temp)}</h6>
                <h6 class="${line}">Angin: ${formatWindSpeed(wind.speed)}</h6>
                <h6 class="${line}">Kelembapan: ${formatHumidity(main.humidity)}</h6>
                <h6 class="${line}">Kualitas Udara: ${airValueMarkup()}</h6>
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

    if (updatedLabel) {
        updatedLabel.textContent = view.at ? `Diperbarui ${formatRelative(view.at)}` : "";
    }

    paintAirValue();

    if (options.keepOpen && Number.isInteger(view.openDayIndex)) openDetails(view.openDayIndex);
    else closeDetails();
};

// Perbarui label "Diperbarui …" tanpa merender ulang seluruh kartu.
const refreshUpdatedLabel = () => {
    if (!updatedLabel) return;

    if (!activeView || !activeView.at) {
        updatedLabel.textContent = "";
        return;
    }
    updatedLabel.textContent = `Diperbarui ${formatRelative(activeView.at)}`;
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

    // Tanggal hari ini tidak diulang sebagai kartu (sudah ada di kartu besar).
    const view = {
        cityName: hasCurrent && currentData.name ? String(currentData.name) : cityName,
        todayLabel,
        timezone,
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
    showAirQualityMessage("Memuat…");
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

    // Tidak di-await: cuaca sudah tampil walau kualitas udara masih dimuat.
    loadAirQuality(latitude, longitude, token);
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
        showAirQualityMessage("Tidak tersedia");
        return;
    }

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
        showAirQualityMessage("Tidak tersedia");
    }
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
const getUserCoordinates = async () => {
    // Cek dukungan sebelum menaikkan token: kalau peramban tidak mendukung,
    // permintaan lain yang sedang berjalan tetap berhak mereset tombol.
    if (!navigator.geolocation) {
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
        showNotice(describeGeoError(error), { kind: "gagal", retry: getUserCoordinates });
    } finally {
        if (!isStale(token)) setLoading(false);
    }
};

// Event listener tombol dan input.
locationButton.addEventListener("click", getUserCoordinates);

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

// Label "Diperbarui …" ikut menua walau tidak ada render baru.
if (typeof window.setInterval === "function") {
    window.setInterval(refreshUpdatedLabel, 30000);
}

// Pulihkan satuan dan kota terakhir dari localStorage.
const restorePreferences = () => {
    const saved = readStorage();
    if (!saved) return;

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

    if (hasCity) reloadLast();
};

restorePreferences();