interface MatiasConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface MatiasOAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
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
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: MatiasConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return;
    }
    await this.login();
  }

  async login(): Promise<MatiasOAuthResponse> {
    const tokenUrl = `${this.baseUrl}/oauth/token`;
    console.log(`Attempting Matias API OAuth login to: ${tokenUrl}`);
    
    try {
      const params = new URLSearchParams();
      params.append("client_id", this.clientId);
      params.append("client_secret", this.clientSecret);
      params.append("grant_type", "client_credentials");

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error_description || errorData.error || errorData.message || errorMessage;
        } catch {
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json() as MatiasOAuthResponse;
      
      if (!data.access_token) {
        throw new Error("No access token received");
      }

      this.accessToken = data.access_token;
      // Set expiration (subtract 60 seconds for safety margin)
      const expiresIn = data.expires_in || 3600;
      this.tokenExpiresAt = new Date(Date.now() + (expiresIn - 60) * 1000);
      
      console.log("Matias API OAuth login successful");
      return data;
    } catch (error) {
      if (error instanceof TypeError && (error.message === "fetch failed" || error.message.includes("fetch"))) {
        throw new Error(`Unable to connect to Matias API at ${tokenUrl}. Please verify the URL is correct and accessible.`);
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiresAt = null;
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { message?: string }).message || `API Error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async createInvoice(invoice: MatiasInvoiceRequest): Promise<MatiasInvoiceResponse> {
    return this.request<MatiasInvoiceResponse>("/api/invoices", {
      method: "POST",
      body: invoice,
    });
  }

  async createCreditNote(
    invoiceId: number,
    items: MatiasInvoiceItem[],
    reason: string
  ): Promise<MatiasInvoiceResponse> {
    return this.request<MatiasInvoiceResponse>("/api/credit-notes", {
      method: "POST",
      body: {
        invoice_id: invoiceId,
        items,
        reason,
      },
    });
  }

  async getInvoice(id: number): Promise<MatiasInvoiceResponse> {
    return this.request<MatiasInvoiceResponse>(`/api/invoices/${id}`);
  }

  async getCities(): Promise<{ id: number; name: string; department: string }[]> {
    return this.request<{ id: number; name: string; department: string }[]>("/api/cities");
  }

  async getPaymentMethods(): Promise<{ id: number; name: string; code: string }[]> {
    return this.request<{ id: number; name: string; code: string }[]>("/api/payment-methods");
  }

  async getPaymentForms(): Promise<{ id: number; name: string; code: string }[]> {
    return this.request<{ id: number; name: string; code: string }[]>("/api/payment-forms");
  }

  async getIdentityDocumentTypes(): Promise<{ id: number; name: string; code: string }[]> {
    return this.request<{ id: number; name: string; code: string }[]>("/api/identity-document-types");
  }

  async getResolutions(): Promise<{ id: number; prefix: string; from: number; to: number; current: number }[]> {
    return this.request<{ id: number; prefix: string; from: number; to: number; current: number }[]>("/api/resolutions");
  }

  async getInvoices(page: number = 1, perPage: number = 15): Promise<{ data: unknown[]; total: number; page: number; per_page: number }> {
    return this.request<{ data: unknown[]; total: number; page: number; per_page: number }>(`/api/invoices?page=${page}&per_page=${perPage}`);
  }

  async getTaxLevels(): Promise<{ id: number; name: string; code: string }[]> {
    return this.request<{ id: number; name: string; code: string }[]>("/api/tax-levels");
  }

  async getTaxRegimes(): Promise<{ id: number; name: string; code: string }[]> {
    return this.request<{ id: number; name: string; code: string }[]>("/api/tax-regimes");
  }

  async getCompanyInfo(): Promise<{ id: number; name: string; nit: string; address: string; phone: string }> {
    return this.request<{ id: number; name: string; nit: string; address: string; phone: string }>("/api/company");
  }
}

export { MatiasApiClient, MatiasConfig, MatiasInvoiceRequest, MatiasInvoiceResponse, MatiasInvoiceItem, MatiasCustomer };
