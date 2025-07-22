import axios from 'axios';

// Type definition for Axios error structure
interface AxiosErrorLike {
  response?: {
    status: number;
    data?: {
      message?: string;
    };
  };
  message: string;
}

interface LencoResponse<T> {
  status: boolean;
  message: string;
  data: T;
  meta?: {
    total: number;
    perPage: number;
    currentPage: number;
    pageCount: number;
  };
}

interface LencoBank {
  code: string;
  name: string;
}

interface LencoAccountResolution {
  accountName: string;
  accountNumber: string;
  bank: LencoBank;
}

class LencoService {
  private apiClient: ReturnType<typeof axios.create>;
  private isConfigured: boolean;

  constructor() {
    const baseURL = process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v1';
    const apiKey = process.env.LENCO_API_KEY;

    this.isConfigured = !!apiKey;

    if (!this.isConfigured) {
      console.error('❌ Lenco API not configured - LENCO_API_KEY missing');
      throw new Error('Lenco API configuration required. Please set LENCO_API_KEY in environment variables.');
    }

    this.apiClient = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 15000 // 15 seconds timeout
    });

    console.log('🏦 Lenco service initialized');
    console.log('- Base URL:', baseURL);
    console.log('- API Key configured:', !!apiKey);
  }

  // Get all supported banks from Lenco API
  async getAllBanks(): Promise<LencoBank[]> {
    try {
      console.log('🏦 Fetching banks from Lenco API...');
      
      const response = await this.apiClient.get<LencoResponse<LencoBank[]>>('/banks');
      
      if (!response.data.status) {
        throw new Error(`Lenco API error: ${response.data.message}`);
      }

      const banks = response.data.data;
      console.log(`✅ Fetched ${banks.length} banks from Lenco`);

      // Sort banks alphabetically for better UX
      return banks.sort((a, b) => a.name.localeCompare(b.name));

    } catch (error: unknown) {
      console.error('❌ Failed to fetch banks from Lenco:', error);
      
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as AxiosErrorLike;
        if (axiosError.response?.status === 401) {
          throw new Error('Invalid Lenco API key. Please check your LENCO_API_KEY.');
        }
        if (axiosError.response?.status && axiosError.response.status >= 500) {
          throw new Error('Lenco API is temporarily unavailable. Please try again later.');
        }
        throw new Error(`Lenco API error: ${axiosError.response?.data?.message || axiosError.message}`);
      }
      
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }
      
      throw new Error('Failed to connect to Lenco API. Please check your internet connection.');
    }
  }

  // Resolve bank account details from Lenco API
  async resolveAccount(accountNumber: string, bankCode: string): Promise<LencoAccountResolution | null> {
    try {
      console.log(`🔍 Resolving account: ${accountNumber} at bank ${bankCode}`);

      const response = await this.apiClient.get<LencoResponse<LencoAccountResolution>>(
        `/resolve?accountNumber=${accountNumber}&bankCode=${bankCode}`
      );

      if (!response.data.status) {
        console.log('❌ Account resolution failed:', response.data.message);
        return null;
      }

      const accountData = response.data.data;
      console.log(`✅ Account resolved: ${accountData.accountName}`);
      
      return accountData;

    } catch (error: unknown) {
      console.error('❌ Account resolution error:', error);
      
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as AxiosErrorLike;
        if (axiosError.response?.status === 400) {
          console.log('❌ Invalid account details provided');
          return null;
        }
        if (axiosError.response?.status === 401) {
          throw new Error('Invalid Lenco API key for account resolution.');
        }
        if (axiosError.response?.status && axiosError.response.status >= 500) {
          throw new Error('Lenco account resolution service is temporarily unavailable.');
        }
      }
      
      throw new Error('Failed to resolve account. Please try again.');
    }
  }

  // Search banks by name or code
  async searchBanks(searchTerm: string): Promise<LencoBank[]> {
    const allBanks = await this.getAllBanks();
    
    if (!searchTerm || searchTerm.trim().length === 0) {
      return allBanks;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    return allBanks.filter(bank => 
      bank.name.toLowerCase().includes(searchLower) ||
      bank.code.includes(searchTerm.trim())
    );
  }

  // Get bank by code
  async getBankByCode(bankCode: string): Promise<LencoBank | null> {
    try {
      const allBanks = await this.getAllBanks();
      return allBanks.find(bank => bank.code === bankCode) || null;
    } catch (error: unknown) {
      console.error('❌ Failed to get bank by code:', error);
      throw error;
    }
  }

  // Get top banks - now fetches all banks from API and returns them all
  async getTopBanks(): Promise<LencoBank[]> {
    try {
      // Simply return all banks from the API
      return await this.getAllBanks();
    } catch (error: unknown) {
      console.error('❌ Failed to get top banks:', error);
      throw error;
    }
  }

  // Check if service is properly configured
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }

  // Get service status
  getServiceStatus() {
    return {
      configured: this.isConfigured,
      baseURL: this.apiClient?.defaults.baseURL,
      hasApiKey: !!process.env.LENCO_API_KEY
    };
  }

  // Validate bank code format
  isValidBankCode(bankCode: string): boolean {
    return /^\d{6}$/.test(bankCode); // Nigerian bank codes are 6 digits
  }

  // Validate account number format  
  isValidAccountNumber(accountNumber: string): boolean {
    return /^\d{10}$/.test(accountNumber); // Nigerian account numbers are 10 digits
  }
}

export default new LencoService();