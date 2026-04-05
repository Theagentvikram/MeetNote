// API configuration and utilities for connecting to the Python FastAPI backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://meetnote-backend.onrender.com';

export const api = {
  baseURL: API_BASE_URL,
  
  // Health check - matches Python backend endpoint
  async checkHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        const data = await response.json();
        return { healthy: true, data };
      }
      return { healthy: false, error: 'Health check failed' };
    } catch (error) {
      console.error('Backend health check failed:', error);
      return { healthy: false, error: (error as Error).message };
    }
  },
  
  // Authentication endpoints - matches Python FastAPI format
  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password
      })
    });
    return response.json();
  },

  async register(email: string, password: string, name: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST', 
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        name
      })
    });
    return response.json();
  },

  async getAuthStatus(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },
  
  // Meeting endpoints - matches Python backend
  async createMeeting(meetingData: any, token: string) {
    const response = await fetch(`${API_BASE_URL}/api/meetings/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(meetingData),
    });
    return response.json();
  },
  
  async getMeetings(token: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/meetings/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
      throw error;
    }
  },
  
  async getMeeting(meetingId: string, token: string) {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  async stopMeeting(meetingId: string, token: string) {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/stop/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  async createHighlight(meetingId: string, highlightData: any, token: string) {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/highlights/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(highlightData),
    });
    return response.json();
  },

  // WebSocket connection for real-time transcription
  createWebSocket(clientId: string) {
    const wsUrl = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    return new WebSocket(`${wsUrl}/ws/${clientId}`);
  },
};

export default api;