export const state = {
  session: null,
  profile: null,      // { id, name, avatar_url, is_admin, ... }
  jetskis: [],
  profiles: [],
  settings: null,
  online: navigator.onLine,
  currentJetskiId: null,
  currentDate: todayISO(),
  currentScreen: "home", // home | detail | overview | profile
};

export function todayISO() {
  const d = new Date();
  return isoFromDate(d);
}

export function isoFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return isoFromDate(dt);
}

const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function formatDateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { weekday: WEEKDAYS[dt.getDay()], label: `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}` };
}

export function formatDateShort(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Gera os slots do dia a partir das configurações (horário de funcionamento + duração)
export function generateSlots(settings) {
  const [openH, openM] = settings.open_time.split(":").map(Number);
  const [closeH, closeM] = settings.close_time.split(":").map(Number);
  const durMin = settings.slot_duration_minutes || 60;

  const slots = [];
  let cursor = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (cursor + durMin <= end) {
    const start = minutesToHHMM(cursor);
    const stop = minutesToHHMM(cursor + durMin);
    slots.push({ start, end: stop });
    cursor += durMin;
  }
  return slots;
}

function minutesToHHMM(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeLabel(hhmmss) {
  return (hhmmss || "").slice(0, 5);
}

// true se [aStart,aEnd) overlaps [bStart,bEnd)
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}
