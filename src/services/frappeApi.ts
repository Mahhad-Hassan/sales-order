const API_BASE_URL = import.meta.env.PROD ? '/api/frappe-proxy' : '';

interface FrappeMessageResponse {
  message: string;
}

interface FrappeLoginResponse {
  message: string;
}

interface FrappeListResponse<T> {
  data: T[];
}

interface FrappeDataResponse<T> {
  data: T;
}

interface FrappeMethodResponse<T> {
  message: T;
  [key: string]: unknown;
}

export class FrappeRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FrappeRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      'The browser did not receive a response from the server. Check network and TLS connectivity, and inspect the browser console for CORS or preflight errors.',
    );
  }

  if (!response.ok) {
    const isLoginRequest = path.split('?')[0] === '/api/method/login';
    if (isLoginRequest && (response.status === 400 || response.status === 401)) {
      throw new FrappeRequestError(
        'The server rejected the login. Check the username and password, or verify the account is allowed to sign in.',
        response.status,
      );
    }
    if (isLoginRequest && response.status === 429) {
      throw new FrappeRequestError(
        'Login attempts are temporarily rate-limited. Wait a moment and try again.',
        response.status,
      );
    }
    if (response.status === 403 && response.headers.get('cf-mitigated') === 'challenge') {
      throw new FrappeRequestError(
        'The API request was blocked by a security challenge. Contact your system administrator to allow this application to access the required routes.',
        response.status,
      );
    }
    if (response.status === 401) {
      if (typeof window !== 'undefined' && !isLoginRequest) {
        window.dispatchEvent(new CustomEvent('frappe:unauthorized', { detail: { path } }));
      }
      throw new FrappeRequestError('Sign-in is required or the session has expired.', response.status);
    }
    if (response.status === 403) {
      throw new FrappeRequestError('Your account does not have permission for this action.', response.status);
    }
    if (response.status >= 500) {
      throw new FrappeRequestError(
        `Server error (HTTP ${response.status}). Please try again later or contact your system administrator.`,
        response.status,
      );
    }
    throw new FrappeRequestError(`Request failed (HTTP ${response.status}).`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const frappeApi = {
  async getList<T>(
    doctype: string,
    fields: string[],
    filters: unknown[][] = [],
    limitPageLength = 20,
    limitStart = 0,
  ): Promise<T[]> {
    const params = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_page_length: String(limitPageLength),
      limit_start: String(limitStart),
    });
    if (filters.length) {
      params.set('filters', JSON.stringify(filters));
    }
    const response = await request<FrappeListResponse<T>>(
      `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`,
    );
    return response.data;
  },

  async getDocument<T>(doctype: string, name: string): Promise<T> {
    const response = await request<FrappeDataResponse<T>>(
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
    return response.data;
  },

  async createDocument<T>(doctype: string, document: Record<string, unknown>): Promise<T> {
    const response = await request<FrappeDataResponse<T>>(
      `/api/resource/${encodeURIComponent(doctype)}`,
      { method: 'POST', body: JSON.stringify(document) },
    );
    return response.data;
  },

  async updateDocument<T>(
    doctype: string,
    name: string,
    changes: Record<string, unknown>,
  ): Promise<T> {
    const response = await request<FrappeDataResponse<T>>(
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      { method: 'PUT', body: JSON.stringify(changes) },
    );
    return response.data;
  },

  async deleteDocument(doctype: string, name: string): Promise<void> {
    await request<unknown>(
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
  },

  async callMethod<T>(method: string, args: Record<string, unknown>): Promise<T> {
    const response = await request<FrappeMethodResponse<T>>(
      `/api/method/${method.split('.').map(encodeURIComponent).join('.')}`,
      { method: 'POST', body: JSON.stringify(args) },
    );
    return response.message;
  },

  async callMethodResponse<T>(
    method: string,
    args: Record<string, unknown>,
  ): Promise<FrappeMethodResponse<T>> {
    return request<FrappeMethodResponse<T>>(
      `/api/method/${method.split('.').map(encodeURIComponent).join('.')}`,
      { method: 'POST', body: JSON.stringify(args) },
    );
  },

  async uploadFile<T>(
    file: File,
    doctype: string,
    docname: string,
    isPrivate = true,
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('doctype', doctype);
    formData.append('docname', docname);
    formData.append('is_private', isPrivate ? '1' : '0');
    const response = await request<FrappeMethodResponse<T>>('/api/method/upload_file', {
      method: 'POST',
      body: formData,
    });
    return response.message;
  },

  async login(username: string, password: string): Promise<string> {
    await request<FrappeLoginResponse>('/api/method/login', {
      method: 'POST',
      body: JSON.stringify({ usr: username, pwd: password }),
    });
    const response = await request<FrappeMessageResponse>(
      '/api/method/frappe.auth.get_logged_user',
    );
    return response.message;
  },

  async getLoggedUser(): Promise<string> {
    const response = await request<FrappeMessageResponse>(
      '/api/method/frappe.auth.get_logged_user',
    );
    return response.message;
  },

  async logout(): Promise<void> {
    await request<FrappeMessageResponse>('/api/method/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
