// Same-origin API endpoint is handled by Vite's proxy in local development.
// This works for localhost and for private LAN addresses on phones/tablets.
const BASE = (import.meta.env.VITE_API_URL?.trim() || '/api').replace(/\/$/, '');

function getToken() {
  return localStorage.getItem('sp_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('sp_token', token);
  else localStorage.removeItem('sp_token');
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const toNumber = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
}

function toObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {}
  }
  return fallback;
}

function normalizePackage(pkg) {
  return pkg ? { ...pkg, price: toNumber(pkg.price), services: toArray(pkg.services) } : pkg;
}

function normalizeAddon(addon) {
  return addon ? { ...addon, price: toNumber(addon.price) } : addon;
}

function normalizeAppointment(appt) {
  if (!appt) return appt;
  return {
    ...appt,
    total_price: toNumber(appt.total_price),
    down_payment: toNumber(appt.down_payment),
    amount_paid: toNumber(appt.amount_paid),
    remaining_balance: toNumber(appt.remaining_balance),
    addon_ids: toArray(appt.addon_ids),
    package: normalizePackage(appt.package),
  };
}

function normalizePayment(payment) {
  return payment ? { ...payment, amount: toNumber(payment.amount), appointment: normalizeAppointment(payment.appointment) } : payment;
}

function normalizeSettings(settings) {
  return settings ? {
    ...settings,
    down_payment_value: toNumber(settings.down_payment_value),
    studio_lat: Number(settings.studio_lat),
    studio_lng: Number(settings.studio_lng),
    daily_capacity: Number(settings.daily_capacity || 0),
    slot_capacity: Number(settings.slot_capacity || 0),
    slot_interval_minutes: Number(settings.slot_interval_minutes || 60),
    business_hours: toObject(settings.business_hours),
  } : settings;
}

async function req(method, path, body) {
  const token = getToken();
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running and both devices are on the same network.', 0, null);
  }

  const isJsonResponse = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJsonResponse ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    if (res.status === 429) {
      const seconds = Number(res.headers.get('retry-after'));
      const waitText = Number.isFinite(seconds) && seconds > 0 ? ` Please wait about ${Math.ceil(seconds / 60)} minute(s) before retrying.` : ' Please wait briefly before retrying.';
      throw new ApiError((payload.error || 'The server received too many requests.') + waitText, 429, payload);
    }
    if (!isJsonResponse && [500, 502, 503, 504].includes(res.status)) {
      throw new ApiError('The backend API is unavailable. Start the backend server on port 5000, then retry.', res.status, payload);
    }
    if (res.status === 401 && path !== '/auth/login') {
      setToken(null);
      localStorage.removeItem('sp_current_user');
      window.dispatchEvent(new Event('sp:unauthorized'));
    }
    throw new ApiError(payload.error || `Request failed (${res.status})`, res.status, payload);
  }
  return payload;
}

export const authApi = {
  register: (data) => req('POST', '/auth/register', data),
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  me: () => req('GET', '/auth/me'),
  updateProfile: (data) => req('PATCH', '/auth/profile', data),
  changePassword: (currentPassword, newPassword) => req('PATCH', '/auth/password', { currentPassword, newPassword }),
};

export const packagesApi = {
  getAll: (adminMode = false) => req('GET', adminMode ? '/packages/admin/all' : '/packages').then((r) => r.packages.map(normalizePackage)),
  find: (id) => req('GET', `/packages/${id}`).then((r) => normalizePackage(r.package)),
  create: (data) => req('POST', '/packages', data).then((r) => normalizePackage(r.package)),
  update: (id, data) => req('PATCH', `/packages/${id}`, data).then((r) => normalizePackage(r.package)),
  delete: (id) => req('DELETE', `/packages/${id}`),
  getAddons: (adminMode = false) => req('GET', adminMode ? '/packages/addons/all' : '/packages/addons/list').then((r) => r.addons.map(normalizeAddon)),
  createAddon: (data) => req('POST', '/packages/addons', data).then((r) => normalizeAddon(r.addon)),
  updateAddon: (id, data) => req('PATCH', `/packages/addons/${id}`, data).then((r) => normalizeAddon(r.addon)),
  deleteAddon: (id) => req('DELETE', `/packages/addons/${id}`),
};

export const availabilityApi = {
  getDate: (date, excludeAppointmentId = null) => {
    const params = new URLSearchParams({ date });
    if (excludeAppointmentId) params.set('exclude_appointment_id', excludeAppointmentId);
    return req('GET', `/availability?${params.toString()}`).then((r) => r.availability);
  },
  getMonth: (month) => req('GET', `/availability?month=${encodeURIComponent(month)}`).then((r) => r.availability),
};

export const appointmentsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/appointments${qs ? `?${qs}` : ''}`).then((r) => r.appointments.map(normalizeAppointment));
  },
  find: (id) => req('GET', `/appointments/${id}`).then((r) => normalizeAppointment(r.appointment)),
  findByTracking: (tn) => req('GET', `/appointments/tracking/${encodeURIComponent(tn)}`).then((r) => normalizeAppointment(r.appointment)),
  scan: (payload) => req('POST', '/appointments/scan', payload).then((r) => ({ appointment: normalizeAppointment(r.appointment), method: r.method })),
  startSession: (id, method = 'qr') => req('POST', `/appointments/${encodeURIComponent(id)}/session/start`, { method }).then((r) => normalizeAppointment(r.appointment)),
  completeSession: (id, method = 'qr') => req('POST', `/appointments/${encodeURIComponent(id)}/session/complete`, { method }).then((r) => normalizeAppointment(r.appointment)),
  scanHistory: (id) => req('GET', `/appointments/${encodeURIComponent(id)}/scan-history`).then((r) => r.scans || []),
  create: (data) => req('POST', '/appointments', data).then((r) => normalizeAppointment(r.appointment)),
  update: (id, data) => req('PATCH', `/appointments/${id}`, data).then((r) => normalizeAppointment(r.appointment)),
  getTodayQueue: () => req('GET', '/appointments/queue/today').then((r) => r.queue.map(normalizeAppointment)),
};

export const photoWorkflowApi = {
  get: (id) => req('GET', `/photo-workflows/${encodeURIComponent(id)}`).then((r) => r.workflow),
  assign: (id, staff_id) => req('PATCH', `/photo-workflows/${encodeURIComponent(id)}/assign`, { staff_id }).then((r) => r.workflow),
  stage: (id, stage, extra = {}) => req('PATCH', `/photo-workflows/${encodeURIComponent(id)}/stage`, { stage, ...extra }).then((r) => r.workflow),
  details: (id, data) => req('PATCH', `/photo-workflows/${encodeURIComponent(id)}/details`, data).then((r) => r.workflow),
};

export const paymentsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req('GET', `/payments${qs ? `?${qs}` : ''}`).then((r) => r.payments.map(normalizePayment));
  },
  create: (data) => {
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'proof' && value) form.append('proof', value);
      else if (value !== undefined && value !== null) form.append(key, String(value));
    });
    return req('POST', '/payments', form).then((r) => normalizePayment(r.payment));
  },
  getProof: async (id) => {
    const token = getToken();
    const res = await fetch(`${BASE}/payments/${encodeURIComponent(id)}/proof`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new ApiError(payload.error || 'Payment proof unavailable', res.status, payload);
    }
    return res.blob();
  },
  update: (id, data) => req('PATCH', `/payments/${id}`, data).then((r) => normalizePayment(r.payment)),
};

export const notificationsApi = {
  getAll: (limit) => req('GET', `/notifications${limit ? `?limit=${limit}` : ''}`).then((r) => r.notifications),
  getUnreadCount: () => req('GET', '/notifications/unread-count').then((r) => r.count),
  markRead: (id) => req('PATCH', `/notifications/${id}/read`),
  markAllRead: () => req('POST', '/notifications/mark-all-read'),
};

export const feedbackApi = {
  getAll: () => req('GET', '/feedback').then((r) => r.feedback),
  create: (data) => req('POST', '/feedback', data).then((r) => r.feedback),
  reply: (id, reply) => req('PATCH', `/feedback/${id}/reply`, { reply }).then((r) => r.feedback),
};

export const usersApi = {
  getAll: (role) => req('GET', `/users${role ? `?role=${encodeURIComponent(role)}` : ''}`).then((r) => r.users),
  find: (id) => req('GET', `/users/${id}`).then((r) => r.user),
  createStaff: (data) => req('POST', '/users/staff', data).then((r) => r.user),
  updateStaff: (id, data) => req('PATCH', `/users/staff/${id}`, data).then((r) => r.user),
};


export const postsApi = {
  getPublic: () => req('GET', '/posts/public').then((r) => r.posts),
  getAll: () => req('GET', '/posts').then((r) => r.posts),
  create: (data) => req('POST', '/posts', data).then((r) => r.post),
  update: (id, data) => req('PATCH', `/posts/${id}`, data).then((r) => r.post),
  delete: (id) => req('DELETE', `/posts/${id}`),
  toggleLike: (id) => req('POST', `/posts/${id}/like`),
};

export const settingsApi = {
  paymentQrUrl: () => `${BASE}/settings/payment-qr`,
  uploadPaymentQr: (file) => { const data = new FormData(); data.append('qr', file); return req('POST', '/settings/payment-qr', data); },
  get: () => req('GET', '/settings').then((r) => normalizeSettings(r.settings)),
  update: (data) => req('PATCH', '/settings', data).then((r) => normalizeSettings(r.settings)),
};

export const schedulesApi = {
  getAll: (date) => req('GET', `/schedules${date ? `?date=${encodeURIComponent(date)}` : ''}`).then((r) => r.schedules),
  create: (data) => req('POST', '/schedules', data).then((r) => r.schedule),
  update: (id, data) => req('PATCH', `/schedules/${id}`, data).then((r) => r.schedule),
  delete: (id) => req('DELETE', `/schedules/${id}`),
};


export const publicStatsApi = {
  get: () => req('GET', '/public-stats'),
};

export const analyticsApi = { get: (range = 'month') => req('GET', `/analytics?range=${encodeURIComponent(range)}`) };
export const activityLogsApi = { getAll: () => req('GET', '/activity-logs').then((r) => r.logs || []) };
