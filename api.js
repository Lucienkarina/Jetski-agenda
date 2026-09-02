import { supabase } from "./supabaseClient.js";
import { PHOTOS_BUCKET } from "./config.js";

/* ---------------- Perfil ---------------- */

export async function getMyProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProfile(userId, name) {
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, fields) {
  const { data, error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function countProfiles() {
  const { count, error } = await supabase.from("profiles").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/* ---------------- Jet skis ---------------- */

export async function listJetskis() {
  const { data, error } = await supabase
    .from("jetskis")
    .select("*, owner:owner_id(id,name)")
    .eq("active", true)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function createJetski({ name, owner_id }) {
  const { data, error } = await supabase.from("jetskis").insert({ name, owner_id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateJetski(id, fields) {
  const { data, error } = await supabase.from("jetskis").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deactivateJetski(id) {
  return updateJetski(id, { active: false });
}

export async function uploadJetskiPhoto(jetskiId, file) {
  const ext = file.name.split(".").pop();
  const path = `${jetskiId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return updateJetski(jetskiId, { photo_url: data.publicUrl });
}

/* ---------------- Settings ---------------- */

export async function getSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

export async function updateSettings(fields) {
  const { data, error } = await supabase.from("settings").update(fields).eq("id", 1).select().single();
  if (error) throw error;
  return data;
}

/* ---------------- Bookings ---------------- */

export async function listBookingsForDate(jetskiId, date) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("jetski_id", jetskiId)
    .eq("date", date)
    .eq("status", "scheduled")
    .order("start_time");
  if (error) throw error;
  return data;
}

export async function listAllBookingsForDate(date) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, jetski:jetski_id(id,name)")
    .eq("date", date)
    .eq("status", "scheduled")
    .order("start_time");
  if (error) throw error;
  return data;
}

export async function listBookingsByUser(userId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, jetski:jetski_id(id,name)")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .gte("date", new Date().toISOString().slice(0, 10))
    .order("date");
  if (error) throw error;
  return data;
}

// Retorna { ok: true, booking } ou { ok: false, reason: 'conflict' | 'error', message }
export async function createBooking({ jetski_id, user_id, user_name, date, start_time, end_time }) {
  const { data, error } = await supabase
    .from("bookings")
    .insert({ jetski_id, user_id, user_name, date, start_time, end_time, type: "booking" })
    .select()
    .single();

  if (error) {
    // 23P01 = exclusion_violation (Postgres) -> horário já ocupado por outra reserva concorrente
    if (error.code === "23P01" || (error.message || "").toLowerCase().includes("overlap")) {
      return { ok: false, reason: "conflict", message: "Este horário acabou de ser reservado por outro usuário." };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true, booking: data };
}

export async function cancelBooking(id) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createBlock({ jetski_id, user_id, user_name, date, start_time, end_time, reason }) {
  const { data, error } = await supabase
    .from("bookings")
    .insert({ jetski_id, user_id, user_name, date, start_time, end_time, type: "blocked", reason })
    .select()
    .single();
  if (error) {
    if (error.code === "23P01") {
      return { ok: false, reason: "conflict", message: "Já existe uma reserva ou bloqueio nesse horário." };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true, booking: data };
}

export async function listAllScheduled({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, jetski:jetski_id(id,name)")
    .eq("status", "scheduled")
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}
