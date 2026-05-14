type Json = Record<string, unknown> | unknown[] | null

async function request<T>(method: string, path: string, body?: Json): Promise<T> {
	const res = await fetch(path, {
		method,
		credentials: 'include',
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	})
	const text = await res.text()
	const data = text ? JSON.parse(text) : null
	if (!res.ok) {
		const message =
			data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
				? data.error
				: `Request failed: ${res.status}`
		throw Object.assign(new Error(message), { status: res.status, data })
	}
	return data as T
}

export const api = {
	get: <T>(path: string) => request<T>('GET', path),
	post: <T>(path: string, body?: Json) => request<T>('POST', path, body),
	put: <T>(path: string, body?: Json) => request<T>('PUT', path, body),
	patch: <T>(path: string, body?: Json) => request<T>('PATCH', path, body),
	delete: <T>(path: string) => request<T>('DELETE', path),
}
