import { supabase, ensureSession } from "./supabaseClient.js";
import * as api from "./api.js";
import { state, todayISO, addDays, formatDateLong, generateSlots } from "./state.js";
import * as ui from "./ui.js";
import { toast } from "./ui.js";

/* ============================== BOOT ============================== */

async function boot() {
  registerServiceWorker();
  watchConnection();

  try {
    state.session = await ensureSession();
  } catch (e) {
    toast("Não foi possível conectar. Verifique sua internet.");
    return;
  }

  const userId = state.session.user.id;
  let profile;
  try {
    profile = await api.getMyProfile(userId);
  } catch (e) {
    toast("Erro ao carregar perfil: " + e.message);
    return;
  }

  if (!profile) {
    showOnboarding();
    return;
  }

  state.profile = profile;
  await enterApp();
}

async function enterApp() {
  document.getElementById("onboarding-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  updateAvatarButton();

  try {
    const [jetskis, settings, profiles] = await Promise.all([
      api.listJetskis(),
      api.getSettings(),
      api.listProfiles(),
    ]);
    state.jetskis = jetskis;
    state.settings = settings;
    state.profiles = profiles;
  } catch (e) {
    toast("Erro ao carregar dados: " + e.message);
  }

  document.getElementById("fleet-sub").textContent = `${state.jetskis.length} jet ski(s) · ${state.profiles.length} proprietário(s)`;

  renderHome();
  subscribeRealtime();
}

function showOnboarding() {
  document.getElementById("onboarding-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function updateAvatarButton() {
  const btn = document.getElementById("avatar-btn");
  if (state.profile?.avatar_url) {
    btn.innerHTML = `<img src="${state.profile.avatar_url}" alt="" />`;
  } else {
    btn.textContent = (state.profile?.name || "?").trim()[0]?.toUpperCase() || "?";
  }
}

/* ============================== NAV ============================== */

function goScreen(name) {
  state.currentScreen = name;
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));

  if (name === "home") renderHome();
  if (name === "overview") renderOverview();
  if (name === "profile") renderProfile();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => goScreen(btn.dataset.nav));
});
document.getElementById("avatar-btn").addEventListener("click", () => goScreen("profile"));

/* ============================== HOME ============================== */

function renderHome() {
  document.getElementById("jetski-grid").innerHTML = ui.renderJetskiGrid(state.jetskis);
  document.getElementById("home-count").textContent = `${state.jetskis.length} no total`;
}

document.getElementById("jetski-grid").addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="view-agenda"]');
  if (!btn) return;
  openDetail(btn.dataset.id);
});

/* ============================== DETAIL (agenda do jet ski) ============================== */

function openDetail(jetskiId) {
  state.currentJetskiId = jetskiId;
  state.currentDate = todayISO();
  goScreen("detail");
  renderDetail();
}

async function renderDetail() {
  const j = state.jetskis.find((x) => x.id === state.currentJetskiId);
  if (!j) return goScreen("home");

  document.getElementById("detail-title").textContent = j.name;
  document.getElementById("detail-owner").textContent = `Proprietário: ${j.owner?.name || "—"}`;

  const { weekday, label } = formatDateLong(state.currentDate);
  document.getElementById("detail-date-weekday").textContent = weekday;
  document.getElementById("detail-date-full").textContent = label;

  const banner = document.getElementById("detail-status-banner");
  if (j.status !== "available") {
    banner.style.display = "block";
    banner.innerHTML = `<div class="empty-state" style="padding:14px 10px">⚫ Este jet ski está indisponível. Novos agendamentos estão bloqueados.</div>`;
  } else {
    banner.style.display = "none";
    banner.innerHTML = "";
  }

  const slotsContainer = document.getElementById("detail-slots");
  slotsContainer.innerHTML = `<div class="skeleton" style="height:120px"></div>`;

  try {
    const bookings = await api.listBookingsForDate(state.currentJetskiId, state.currentDate);
    const slots = generateSlots(state.settings);
    slotsContainer.innerHTML = ui.renderSlots(slots, bookings, state.profile.id);
    slotsContainer.dataset.jetskiStatus = j.status;
  } catch (e) {
    slotsContainer.innerHTML = `<div class="empty-state">Erro ao carregar agenda.</div>`;
  }
}

document.getElementById("detail-back").addEventListener("click", () => goScreen("home"));
document.getElementById("detail-prev-day").addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, -1);
  renderDetail();
});
document.getElementById("detail-next-day").addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, 1);
  renderDetail();
});

document.getElementById("detail-slots").addEventListener("click", (e) => {
  if (!state.online) {
    toast("Sem conexão. Conecte-se à internet para realizar um agendamento.");
    return;
  }
  const bookBtn = e.target.closest('[data-action="book-slot"]');
  if (bookBtn) {
    const j = state.jetskis.find((x) => x.id === state.currentJetskiId);
    if (j.status !== "available") {
      toast("Este jet ski está indisponível no momento.");
      return;
    }
    openBookingModal(bookBtn.dataset.start, bookBtn.dataset.end);
    return;
  }
  const cancelEl = e.target.closest('[data-action="cancel-slot"]');
  if (cancelEl) openCancelModal(cancelEl.dataset.bookingId, "detail");
});

/* ---- booking modal ---- */

let pendingBooking = null;

function openBookingModal(start, end) {
  const j = state.jetskis.find((x) => x.id === state.currentJetskiId);
  pendingBooking = { jetski_id: j.id, date: state.currentDate, start_time: start, end_time: end };
  document.getElementById("bk-jetski").textContent = j.name;
  document.getElementById("bk-date").textContent = formatDateLong(state.currentDate).label;
  document.getElementById("bk-time").textContent = `${start} → ${end}`;
  document.getElementById("bk-user").textContent = state.profile.name;
  document.getElementById("modal-booking").classList.remove("hidden");
}

document.getElementById("bk-cancel").addEventListener("click", () => {
  document.getElementById("modal-booking").classList.add("hidden");
});

document.getElementById("bk-confirm").addEventListener("click", async () => {
  if (!pendingBooking) return;
  const btn = document.getElementById("bk-confirm");
  btn.disabled = true;
  const res = await api.createBooking({
    ...pendingBooking,
    user_id: state.profile.id,
    user_name: state.profile.name,
  });
  btn.disabled = false;
  document.getElementById("modal-booking").classList.add("hidden");
  if (res.ok) {
    toast("Agendamento realizado com sucesso!");
    renderDetail();
  } else {
    toast(res.message || "Não foi possível agendar.");
    renderDetail();
  }
});

/* ---- cancel modal (own booking, from detail or profile) ---- */

let pendingCancelId = null;
let pendingCancelOrigin = "detail";

function openCancelModal(bookingId, origin) {
  pendingCancelId = bookingId;
  pendingCancelOrigin = origin;
  const j = state.jetskis.find((x) => x.id === state.currentJetskiId);
  document.getElementById("ck-jetski").textContent = j ? j.name : "—";
  document.getElementById("ck-date").textContent = formatDateLong(state.currentDate).label;
  document.getElementById("ck-time").textContent = "";
  document.getElementById("modal-cancel").classList.remove("hidden");
}

document.getElementById("ck-back").addEventListener("click", () => {
  document.getElementById("modal-cancel").classList.add("hidden");
});

document.getElementById("ck-confirm").addEventListener("click", async () => {
  if (!pendingCancelId) return;
  try {
    await api.cancelBooking(pendingCancelId);
    toast("Reserva cancelada.");
  } catch (e) {
    toast("Erro ao cancelar: " + e.message);
  }
  document.getElementById("modal-cancel").classList.add("hidden");
  if (pendingCancelOrigin === "detail") renderDetail();
  else renderProfile();
});

/* ============================== OVERVIEW (agenda geral) ============================== */

async function renderOverview() {
  const { weekday, label } = formatDateLong(state.currentDate);
  document.getElementById("overview-date-weekday").textContent = weekday;
  document.getElementById("overview-date-full").textContent = label;

  const list = document.getElementById("overview-list");
  list.innerHTML = `<div class="skeleton" style="height:160px"></div>`;

  try {
    const bookings = await api.listAllBookingsForDate(state.currentDate);
    const byJetski = {};
    bookings.forEach((b) => {
      (byJetski[b.jetski_id] ||= []).push(b);
    });
    list.innerHTML = ui.renderOverview(state.jetskis, byJetski);
  } catch (e) {
    list.innerHTML = `<div class="empty-state">Erro ao carregar agenda geral.</div>`;
  }
}

document.getElementById("overview-prev-day").addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, -1);
  renderOverview();
});
document.getElementById("overview-next-day").addEventListener("click", () => {
  state.currentDate = addDays(state.currentDate, 1);
  renderOverview();
});

/* ============================== PROFILE ============================== */

async function renderProfile() {
  document.getElementById("profile-name").value = state.profile.name;

  const myBookingsEl = document.getElementById("my-bookings");
  myBookingsEl.innerHTML = `<div class="skeleton" style="height:80px"></div>`;
  try {
    const bookings = await api.listBookingsByUser(state.profile.id);
    myBookingsEl.innerHTML = ui.renderMyBookings(bookings);
  } catch (e) {
    myBookingsEl.innerHTML = `<div class="empty-state">Erro ao carregar suas reservas.</div>`;
  }

  const adminPanel = document.getElementById("admin-panel");
  if (state.profile.is_admin) {
    adminPanel.classList.remove("hidden");
    await renderAdminPanel();
  } else {
    adminPanel.classList.add("hidden");
  }
}

document.getElementById("profile-save").addEventListener("click", async () => {
  const name = document.getElementById("profile-name").value.trim();
  const msg = document.getElementById("profile-msg");
  if (!name) {
    msg.textContent = "O nome não pode ficar em branco.";
    return;
  }
  try {
    state.profile = await api.updateProfile(state.profile.id, { name });
    updateAvatarButton();
    msg.textContent = "Salvo!";
    setTimeout(() => (msg.textContent = ""), 2000);
  } catch (e) {
    msg.textContent = "Erro ao salvar: " + e.message;
  }
});

document.getElementById("my-bookings").addEventListener("click", (e) => {
  const row = e.target.closest('[data-action="cancel-slot"]');
  if (!row) return;
  pendingCancelId = row.dataset.bookingId;
  pendingCancelOrigin = "profile";
  document.getElementById("ck-jetski").textContent = "";
  document.getElementById("ck-date").textContent = "";
  document.getElementById("ck-time").textContent = "";
  document.getElementById("modal-cancel").classList.remove("hidden");
});

document.getElementById("logout-hint").addEventListener("click", async () => {
  if (!confirm("Isso vai desconectar este dispositivo. Você precisará digitar seu nome novamente. Continuar?")) return;
  await supabase.auth.signOut();
  location.reload();
});

/* ---- Admin panel ---- */

async function renderAdminPanel() {
  document.getElementById("admin-jetski-list").innerHTML = ui.renderAdminJetskis(state.jetskis);
  document.getElementById("admin-owner-list").innerHTML = ui.renderAdminOwners(state.profiles);
  document.getElementById("admin-owner-count").textContent = state.profiles.length;

  document.getElementById("settings-open").value = state.settings.open_time.slice(0, 5);
  document.getElementById("settings-close").value = state.settings.close_time.slice(0, 5);
  document.getElementById("settings-duration").value = String(state.settings.slot_duration_minutes);

  try {
    const all = await api.listAllScheduled({ limit: 200 });
    document.getElementById("admin-all-bookings").innerHTML = ui.renderAdminAllBookings(all);
  } catch (e) {
    document.getElementById("admin-all-bookings").innerHTML = `<div class="empty-state">Erro ao carregar reservas.</div>`;
  }
}

document.getElementById("admin-jetski-list").addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="edit-jetski"]');
  if (!btn) return;
  openJetskiModal(state.jetskis.find((j) => j.id === btn.dataset.id));
});

document.getElementById("admin-all-bookings").addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="admin-cancel-booking"]');
  if (!btn) return;
  if (!confirm("Cancelar esta reserva?")) return;
  try {
    await api.cancelBooking(btn.dataset.bookingId);
    toast("Reserva cancelada.");
    renderAdminPanel();
  } catch (err) {
    toast("Erro: " + err.message);
  }
});

document.getElementById("admin-add-jetski").addEventListener("click", () => openJetskiModal(null));

function openJetskiModal(jetski) {
  const ownerSelect = document.getElementById("jk-owner");
  ownerSelect.innerHTML = state.profiles.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");

  document.getElementById("jk-title").textContent = jetski ? "Editar jet ski" : "Novo jet ski";
  document.getElementById("jk-name").value = jetski?.name || "";
  document.getElementById("jk-status").value = jetski?.status || "available";
  document.getElementById("jk-photo").value = "";
  if (jetski) ownerSelect.value = jetski.owner_id || "";

  document.getElementById("jk-remove").classList.toggle("hidden", !jetski);
  document.getElementById("modal-jetski").dataset.editingId = jetski?.id || "";
  document.getElementById("modal-jetski").classList.remove("hidden");
}

document.getElementById("jk-cancel").addEventListener("click", () => {
  document.getElementById("modal-jetski").classList.add("hidden");
});

document.getElementById("jk-save").addEventListener("click", async () => {
  const modal = document.getElementById("modal-jetski");
  const editingId = modal.dataset.editingId;
  const name = document.getElementById("jk-name").value.trim();
  const owner_id = document.getElementById("jk-owner").value;
  const status = document.getElementById("jk-status").value;
  const photoFile = document.getElementById("jk-photo").files[0];

  if (!name) {
    toast("Dê um nome ao jet ski.");
    return;
  }

  try {
    let jetski;
    if (editingId) {
      jetski = await api.updateJetski(editingId, { name, owner_id, status });
    } else {
      jetski = await api.createJetski({ name, owner_id });
      if (status !== "available") jetski = await api.updateJetski(jetski.id, { status });
    }
    if (photoFile) {
      jetski = await api.uploadJetskiPhoto(jetski.id, photoFile);
    }
    toast("Jet ski salvo!");
    modal.classList.add("hidden");
    await refreshJetskis();
    renderAdminPanel();
  } catch (e) {
    toast("Erro ao salvar jet ski: " + e.message);
  }
});

document.getElementById("jk-remove").addEventListener("click", async () => {
  const modal = document.getElementById("modal-jetski");
  const editingId = modal.dataset.editingId;
  if (!editingId) return;
  if (!confirm("Remover este jet ski da agenda?")) return;
  try {
    await api.deactivateJetski(editingId);
    toast("Jet ski removido.");
    modal.classList.add("hidden");
    await refreshJetskis();
    renderAdminPanel();
  } catch (e) {
    toast("Erro: " + e.message);
  }
});

document.getElementById("settings-save").addEventListener("click", async () => {
  try {
    state.settings = await api.updateSettings({
      open_time: document.getElementById("settings-open").value,
      close_time: document.getElementById("settings-close").value,
      slot_duration_minutes: Number(document.getElementById("settings-duration").value),
    });
    toast("Configuração salva!");
  } catch (e) {
    toast("Erro: " + e.message);
  }
});

document.getElementById("admin-add-block").addEventListener("click", () => {
  const sel = document.getElementById("bl-jetski");
  sel.innerHTML = state.jetskis.map((j) => `<option value="${j.id}">${j.name}</option>`).join("");
  document.getElementById("bl-date").value = todayISO();
  document.getElementById("bl-start").value = "08:00";
  document.getElementById("bl-end").value = "09:00";
  document.getElementById("bl-reason").value = "Manutenção";
  document.getElementById("modal-block").classList.remove("hidden");
});

document.getElementById("bl-cancel").addEventListener("click", () => {
  document.getElementById("modal-block").classList.add("hidden");
});

document.getElementById("bl-confirm").addEventListener("click", async () => {
  const jetski_id = document.getElementById("bl-jetski").value;
  const date = document.getElementById("bl-date").value;
  const start_time = document.getElementById("bl-start").value;
  const end_time = document.getElementById("bl-end").value;
  const reason = document.getElementById("bl-reason").value.trim() || "Bloqueado";

  if (!jetski_id || !date || !start_time || !end_time || start_time >= end_time) {
    toast("Preencha os campos corretamente.");
    return;
  }

  const res = await api.createBlock({
    jetski_id, date, start_time, end_time, reason,
    user_id: state.profile.id, user_name: state.profile.name,
  });
  document.getElementById("modal-block").classList.add("hidden");
  if (res.ok) {
    toast("Horário bloqueado.");
    if (state.currentJetskiId === jetski_id) renderDetail();
  } else {
    toast(res.message);
  }
});

async function refreshJetskis() {
  state.jetskis = await api.listJetskis();
  document.getElementById("fleet-sub").textContent = `${state.jetskis.length} jet ski(s) · ${state.profiles.length} proprietário(s)`;
}

/* ============================== ONBOARDING ============================== */

document.getElementById("onboard-save").addEventListener("click", async () => {
  const nameInput = document.getElementById("onboard-name");
  const name = nameInput.value.trim();
  const errEl = document.getElementById("onboard-error");
  errEl.textContent = "";
  if (!name) {
    errEl.textContent = "Digite seu nome.";
    return;
  }
  try {
    const count = await api.countProfiles();
    if (count >= 10) {
      errEl.textContent = "O limite de 10 proprietários já foi atingido.";
      return;
    }
    state.profile = await api.createProfile(state.session.user.id, name);
    await enterApp();
  } catch (e) {
    errEl.textContent = "Erro ao salvar: " + e.message;
  }
});

/* ============================== REALTIME ============================== */

function subscribeRealtime() {
  supabase
    .channel("public:bookings")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
      if (state.currentScreen === "detail") renderDetail();
      if (state.currentScreen === "overview") renderOverview();
      if (state.currentScreen === "profile" && state.profile?.is_admin) renderAdminPanel();
      if (state.currentScreen === "profile") renderProfile();
    })
    .subscribe();

  supabase
    .channel("public:jetskis")
    .on("postgres_changes", { event: "*", schema: "public", table: "jetskis" }, async () => {
      await refreshJetskis();
      if (state.currentScreen === "home") renderHome();
      if (state.currentScreen === "detail") renderDetail();
    })
    .subscribe();
}

/* ============================== CONNECTIVITY ============================== */

function watchConnection() {
  const banner = document.getElementById("conn-banner");
  const text = document.getElementById("conn-text");

  function update() {
    state.online = navigator.onLine;
    banner.classList.toggle("offline", !state.online);
    text.textContent = state.online
      ? "Conectado — agenda em tempo real"
      : "Sem conexão — não é possível agendar agora";
  }
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

/* ============================== SERVICE WORKER ============================== */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

/* ============================== GO ============================== */

boot();
