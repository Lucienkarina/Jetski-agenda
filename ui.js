import { formatDateShort, initials, timeLabel } from "./state.js";

export function toast(msg, ms = 3200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

export function renderJetskiGrid(jetskis) {
  if (!jetskis.length) {
    return `<div class="empty-state"><span class="ic">🛥️</span>Nenhum jet ski cadastrado ainda.</div>`;
  }
  return jetskis
    .map((j) => {
      const isAvailable = j.status === "available";
      const photo = j.photo_url
        ? `<img src="${j.photo_url}" alt="${escapeHtml(j.name)}" />`
        : `<span class="ph-icon">🛥️</span>`;
      return `
      <div class="jetski-card">
        <div class="jetski-photo">
          ${photo}
          <span class="status-pill ${isAvailable ? "available" : "unavailable"}">
            <span class="status-dot"></span>${isAvailable ? "Disponível" : "Indisponível"}
          </span>
        </div>
        <div class="jetski-body">
          <h3>${escapeHtml(j.name)}</h3>
          <div class="jetski-owner">Proprietário: ${escapeHtml(j.owner?.name || "—")}</div>
          <button class="btn btn-primary btn-block" data-action="view-agenda" data-id="${j.id}">Ver agenda</button>
        </div>
      </div>`;
    })
    .join("");
}

export function renderSlots(slots, bookings, myUserId) {
  return slots
    .map((s) => {
      const b = bookings.find((bk) => bk.start_time.slice(0, 5) === s.start && bk.end_time.slice(0, 5) === s.end);
      if (!b) {
        return `
        <div class="slot clickable" data-action="book-slot" data-start="${s.start}" data-end="${s.end}">
          <div><div class="slot-time">${s.start} → ${s.end}</div></div>
          <span class="slot-tag available">Disponível</span>
        </div>`;
      }
      if (b.type === "blocked") {
        return `
        <div class="slot">
          <div>
            <div class="slot-time">${s.start} → ${s.end}</div>
            <div class="slot-sub">${escapeHtml(b.reason || "Indisponível")}</div>
          </div>
          <span class="slot-tag blocked">Bloqueado</span>
        </div>`;
      }
      const mine = b.user_id === myUserId;
      return `
      <div class="slot ${mine ? "clickable" : ""}" ${mine ? `data-action="cancel-slot" data-booking-id="${b.id}"` : ""}>
        <div>
          <div class="slot-time">${s.start} → ${s.end}</div>
          <div class="slot-sub">${escapeHtml(b.user_name)}${mine ? " (você — toque para cancelar)" : ""}</div>
        </div>
        <span class="slot-tag booked">Agendado</span>
      </div>`;
    })
    .join("");
}

export function renderOverview(jetskis, bookingsByJetski) {
  return jetskis
    .map((j) => {
      const rows = bookingsByJetski[j.id] || [];
      const body = rows.length
        ? rows
            .map(
              (b) => `
          <div class="overview-row">
            <span>${timeLabel(b.start_time)}–${timeLabel(b.end_time)} ${b.type === "blocked" ? "⚫" : "🔴"}</span>
            <span class="who">${escapeHtml(b.type === "blocked" ? b.reason || "Bloqueado" : b.user_name)}</span>
          </div>`
            )
            .join("")
        : `<div class="overview-row"><span style="color:var(--ink-soft)">Nenhuma reserva neste dia</span></div>`;
      return `<div class="overview-group"><h3>${escapeHtml(j.name)}</h3>${body}</div>`;
    })
    .join("");
}

export function renderMyBookings(bookings) {
  if (!bookings.length) {
    return `<div class="empty-state"><span class="ic">🗓️</span>Você ainda não tem reservas futuras.</div>`;
  }
  return bookings
    .map(
      (b) => `
    <div class="list-row" data-action="cancel-slot" data-booking-id="${b.id}" style="cursor:pointer">
      <div>
        <strong>${escapeHtml(b.jetski?.name || "Jet ski")}</strong>
        <div class="meta">${formatDateShort(b.date)} · ${timeLabel(b.start_time)}–${timeLabel(b.end_time)}</div>
      </div>
      <span class="icon-btn">✕</span>
    </div>`
    )
    .join("");
}

export function renderAdminJetskis(jetskis) {
  return jetskis
    .map(
      (j) => `
    <div class="list-row">
      <div>
        <strong>${escapeHtml(j.name)}</strong>
        <div class="meta">${escapeHtml(j.owner?.name || "sem proprietário")} · ${j.status === "available" ? "🟢 Disponível" : "⚫ Indisponível"}</div>
      </div>
      <button class="icon-btn" data-action="edit-jetski" data-id="${j.id}">✎</button>
    </div>`
    )
    .join("");
}

export function renderAdminOwners(profiles) {
  return profiles
    .map(
      (p) => `
    <div class="list-row">
      <div>
        <strong>${escapeHtml(p.name)}</strong>${p.is_admin ? '<span class="badge-admin">ADMIN</span>' : ""}
      </div>
      <div class="meta">${initials(p.name)}</div>
    </div>`
    )
    .join("");
}

export function renderAdminAllBookings(bookings) {
  if (!bookings.length) return `<div class="empty-state">Nenhuma reserva ativa.</div>`;
  return bookings
    .map(
      (b) => `
    <div class="list-row">
      <div>
        <strong>${escapeHtml(b.jetski?.name || "—")}</strong>
        <div class="meta">${formatDateShort(b.date)} · ${timeLabel(b.start_time)}–${timeLabel(b.end_time)} · ${escapeHtml(b.user_name)}</div>
      </div>
      <button class="icon-btn" data-action="admin-cancel-booking" data-booking-id="${b.id}">✕</button>
    </div>`
    )
    .join("");
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
