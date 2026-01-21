interface MatiasConfig {
  baseUrl: string;
  email: string;
  password: string;
}

interface MatiasAuthResponse {
  access_token: string;
  user: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    name: string;
  };
  expires_at: string;
  message: string;
  success: boolean;
}

interface MatiasInvoiceItem {
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount?: number;
}

interface MatiasCustomer {
  identification_number: string;
  name: string;
  email: string;
  address?: string;
  phone?: string;
  city_id?: number;
  identity_document_id?: number;
}

interface MatiasInvoiceRequest {
  customer: MatiasCustomer;
  items: MatiasInvoiceItem[];
  payment_method_id?: number;
  payment_form_id?: number;
  notes?: string;
  prefix?: string;
  resolution_id?: number;
}

interface MatiasInvoiceResponse {
  success: boolean;
  message: string;
  data?: {
    id: number;
    number: string;
    cufe: string;
    qr_code: string;
    pdf_url: string;
    xml_url: string;
    created_at: string;
  };
  errors?: Record<string, string[]>;
}

class MatiasApiClient {
  private baseUrl: string;
  private email: string;
  private password: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: MatiasConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.email = config.email;
    this.password = config.password;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return;
    }
    await this.login();
  }

  async login(): Promise<MatiasAuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        email: this.email,
        password: this.password,
        remember_me: 0,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { message?: string }).message || "Authentication failed");
    }

    const data = await response.json() as MatiasAuthResponse;
    
    if (!data.success) {
      throw new Error(data.message || "Authentication failed");
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(data.expires_at);
    
    return data;
  }

  async logout(): Promise<void> {
    if (!this.accessToken) return;

    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Accept": "application/json",
        },
      });
    } finally {
      this.accessToken = null;
      this.tokenExpiresAt = null;
    }
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      body?: unknown;
    } = {}
  ): Promise<T> {
    await this.ensureAuthenticated();

    const { method = "GET", body } = options;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as T;

    if (!response.ok) {
      throw new Error((data as { message?: string }).message || `Request failed: ${response.status}`);
    }

    return data;
  }

  async createInvoice(invoice: MatiasInvoiceRequest): Promise<MatiasInvoiceResponse> {
    return this.request<MatiasInvoiceResponse>("/invoices", {
      method: "POST",
      body: invoice,
    });
  }

  async getInvoice(invoiceId: number): Promise<MatiasInvoiceResponse> {
    return this.request<MatiasInvoiceResponse>(`/invoices/${invoiceId}`);
  }

  async getInvoices(page = 1, perPage = 15): Promise<{ data: unknown[]; meta: { total: number; per_page: number; current_page: number } }> {
    return this.request(`/invoices?page=${page}&per_page=${perPage}`);
  }

  async createCreditNote(originalInvoiceId: number, reason: string, items?: MatiasInvoiceItem[]): Promise<MatiasInvoiceResponse> {
    return this.request<MatiasInvoiceResponse>("/credit-notes", {
      method: "POST",
      body: {
        invoice_id: originalInvoiceId,
        reason,
        items,
      },
    });
  }

  async getCompanyInfo(): Promise<unknown> {
    return this.request("/company");
  }

  async getResolutions(): Promise<{ data: unknown[] }> {
    return this.request("/resolutions");
  }

  async getCities(): Promise<{ data: { id: number; name: string; department: string }[] }> {
    return this.request("/cities");
  }

  async getPaymentMethods(): Promise<{ data: { id: number; name: string }[] }> {
    return this.request("/payment-methods");
  }

  async getPaymentForms(): Promise<{ data: { id: number; name: string }[] }> {
    return this.request("/payment-forms");
  }

  async getIdentityDocumentTypes(): Promise<{ data: { id: number; name: string; code: string }[] }> {
    return this.request("/identity-document-types");
  }

  async getTaxLevels(): Promise<{ data: { id: number; name: string }[] }> {
    return this.request("/tax-levels");
  }

  async getTaxRegimes(): Promise<{ data: { id: number; name: string }[] }> {
    return this.request("/tax-regimes");
  }

  isAuthenticated(): boolean {
    return !!(this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date());
  }
}

let matiasClient: MatiasApiClient | null = null;

export function initializeMatiasClient(config: MatiasConfig): MatiasApiClient {
  matiasClient = new MatiasApiClient(config);
  return matiasClient;
}

export function getMatiasClient(): MatiasApiClient | null {
  return matiasClient;
}

export { MatiasApiClient, MatiasConfig, MatiasInvoiceRequest, MatiasInvoiceItem, MatiasCustomer, MatiasInvoiceResponse };
