// ============================================
// GANTI 2 BARIS INI DENGAN MILIK ANDA!
// ============================================
const SUPABASE_URL = "https://yujvcpdhntanncxzopds.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rt-7MMR2Kk4CFaObF4BcGA_0lL_QBbB";

// ============================================
// INIT SUPABASE (DIPERBAIKI)
// ============================================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const NIP_DOMAIN = "agungtex.com";

let currentUser = null;
let currentPos = null;
let kantor = { lat: -7.544717618937254, lng: 110.89159640176129, radius: 200, nama: "Kantor" };

// ============================================
// JAM REALTIME
// ============================================
setInterval(() => {
  document.getElementById("clock").textContent = new Date().toLocaleTimeString("id-ID");
}, 1000);

// ============================================
// LOGIN (DIPERBAIKI)
// ============================================
async function login() {
  const nip = document.getElementById("nipInput").value.trim();
  const password = document.getElementById("password").value;
  const btn = document.getElementById("btnLogin");
  const err = document.getElementById("loginError");

  if (!nip || !password) {
    err.textContent = "NIP dan password wajib diisi";
    return;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(nip)) {
    err.textContent = "NIP hanya boleh huruf, angka, titik, strip, underscore";
    return;
  }

  const email = `${nip}@${NIP_DOMAIN}`;
  btn.disabled = true;
  btn.textContent = "Memproses...";
  err.textContent = "";

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    err.textContent = error.message.includes("Invalid")
      ? "NIP atau password salah"
      : error.message;
    btn.disabled = false;
    btn.textContent = "Masuk";
    return;
  }

  // Jeda 1 detik agar Supabase selesai menyimpan token sesi di browser
  await new Promise(resolve => setTimeout(resolve, 1000));

  await loadProfile(data.user);
  btn.disabled = false;
  btn.textContent = "Masuk";
}

// ============================================
// PROFIL & STATE (DIPERBAIKI)
// ============================================
async function loadProfile(authUser) {
  // Menggunakan maybeSingle() agar tidak error jika data kosong
  const { data: profile, error } = await db
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    alert("Error sistem: " + error.message);
    await db.auth.signOut();
    return;
  }

  if (!profile) {
    alert("Profil belum terdaftar di tabel users. Hubungi admin.");
    await db.auth.signOut();
    return;
  }

  currentUser = profile;
  showApp();
  await loadKantor();
  getLocation();
  loadHistory();
}

function showApp() {
  document.getElementById("userName").textContent = currentUser.nama;
  document.getElementById("userNip").textContent = `NIP: ${currentUser.nip}`;
  document.getElementById("loginSection").classList.add("hidden");
  document.getElementById("mainSection").classList.remove("hidden");
}

function hideApp() {
  document.getElementById("loginSection").classList.remove("hidden");
  document.getElementById("mainSection").classList.add("hidden");
}

async function logout() {
  if (!confirm("Yakin ingin keluar?")) return;
  await db.auth.signOut();
  currentUser = null;
  currentPos = null;
  hideApp();
}

// Cek sesi saat halaman dibuka (auto-login)
db.auth.getSession().then(async ({ data: { session } }) => {
  if (session?.user) {
    await loadProfile(session.user);
  }
});

// ============================================
// KANTOR
// ============================================
async function loadKantor() {
  const { data, error } = await db.from("kantor").select("*").eq("id", 1).maybeSingle();
  if (!error && data) kantor = data;
}

// ============================================
// GPS
// ============================================
function getLocation() {
  const status = document.getElementById("locationStatus");
  status.textContent = "Mengambil lokasi...";

  if (!navigator.geolocation) {
    status.textContent = "❌ Browser tidak mendukung GPS";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy
      };
      renderLocation();
    },
    (err) => { status.textContent = `❌ Gagal: ${err.message}`; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderLocation() {
  if (!currentPos) return;
  const jarak = haversine(kantor.lat, kantor.lng, currentPos.lat, currentPos.lng);
  const dalam = jarak <= kantor.radius;

  document.getElementById("coords").textContent =
    `Lat: ${currentPos.lat.toFixed(6)}, Lng: ${currentPos.lng.toFixed(6)} (±${Math.round(currentPos.acc)}m)`;
  document.getElementById("distance").textContent =
    `Jarak dari ${kantor.nama}: ${jarak.toFixed(0)}m ${dalam ? "✅" : "❌"}`;
  document.getElementById("locationStatus").textContent =
    dalam ? "✅ Anda berada di area kantor" : "⚠️ Anda di luar area kantor";
}

// ============================================
// ABSEN
// ============================================
async function absen(type) {
  if (!currentUser) return alert("Silakan login dulu!");
  if (!currentPos) return alert("Lokasi belum terdeteksi. Refresh dulu.");

  const jarak = haversine(kantor.lat, kantor.lng, currentPos.lat, currentPos.lng);
  if (jarak > kantor.radius) {
    return alert(`❌ Di luar radius kantor (${jarak.toFixed(0)}m)`);
  }

  // Cek sudah absen hari ini?
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: existing } = await db
    .from("absensi")
    .select("id")
    .eq("uid", currentUser.id)
    .eq("type", type)
    .gte("waktu", today.toISOString());

  if (existing && existing.length > 0) {
    return alert(`Anda sudah ${type === "in" ? "Check-In" : "Check-Out"} hari ini.`);
  }

  const { error } = await db.from("absensi").insert({
    uid: currentUser.id,
    type,
    lat: currentPos.lat,
    lng: currentPos.lng,
    jarak: Math.round(jarak),
    kantor: kantor.nama
  });

  if (error) {
    alert("Gagal menyimpan: " + error.message);
    return;
  }

  alert(`✅ ${type === "in" ? "Check-In" : "Check-Out"} berhasil!`);
  loadHistory();
}

// ============================================
// RIWAYAT
// ============================================
async function loadHistory() {
  if (!currentUser) return;
  const container = document.getElementById("history");
  container.innerHTML = "<p style='color:#94a3b8;font-size:13px'>Memuat...</p>";

  const { data, error } = await db
    .from("absensi")
    .select("*")
    .eq("uid", currentUser.id)
    .order("waktu", { ascending: false })
    .limit(10);

  if (error) {
    container.innerHTML = `<p class="error">Gagal memuat: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p style='color:#94a3b8;font-size:13px'>Belum ada riwayat</p>";
    return;
  }

  container.innerHTML = data.map(h => `
    <div class="history-item ${h.type}">
      <strong>${h.type === "in" ? "✅ Check-In" : "🚪 Check-Out"}</strong><br>
      ${new Date(h.waktu).toLocaleString("id-ID")}<br>
      <small>📍 ${h.lat.toFixed(5)}, ${h.lng.toFixed(5)} (${h.jarak}m)</small>
    </div>
  `).join("");
}
