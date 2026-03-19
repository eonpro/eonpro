export const api = {
  async post(endpoint: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/wellmedr/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { success: res.ok && data.success !== false, data, error: data.error };
  },

  async get(endpoint: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`/api/wellmedr/${endpoint}${qs}`);
    const data = await res.json();
    return { success: res.ok, data };
  },
};
