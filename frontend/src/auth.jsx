// F8: tiny session helper shared by Auth.jsx and App.jsx
export function readSession() {
  try {
    const raw = localStorage.getItem('pd-session')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeSession(data) {
  // data: { access_token, token_type, role, user_id, email, company_id }
  localStorage.setItem('pd-token', data.access_token)
  localStorage.setItem('pd-session', JSON.stringify({
    token: data.access_token,
    role: data.role,
    user_id: data.user_id,
    email: data.email,
    company_id: data.company_id,
  }))
  window.dispatchEvent(new Event('pd-session-changed'))
}

export function clearSession() {
  localStorage.removeItem('pd-token')
  localStorage.removeItem('pd-session')
  window.dispatchEvent(new Event('pd-session-changed'))
}

export function authFetch(url, options = {}) {
  const token = localStorage.getItem('pd-token')
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = 'Bearer ' + token
  return fetch(url, { ...options, headers })
}

export const ROLE_LABELS = { seller: 'Продавец', buyer: 'Покупатель' }
