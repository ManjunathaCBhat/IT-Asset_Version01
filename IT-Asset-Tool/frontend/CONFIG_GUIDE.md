# Configuration Management Guide

## Overview
This project uses a centralized configuration approach to manage environment variables and application settings.

## Files Structure

```
frontend/
├── .env                     # Current environment variables
├── .env.example             # Template/backup environment file
└── src/
    └── config/
        └── config.js        # Centralized configuration file
```

## How to Use

### 1. Environment Variables (.env)
Create or update `frontend/.env`:
```bash
REACT_APP_API_BASE_URL=http://localhost:5000
REACT_APP_DEBUG_MODE=true
REACT_APP_ENVIRONMENT=development
```

### 2. Import Configuration in Components
```javascript
// Import the config
import config, { getEndpointUrl, debugLog } from './config/config';

// Use configuration
const apiUrl = config.API_BASE_URL;
const equipmentUrl = getEndpointUrl('EQUIPMENT'); // Returns: http://localhost:5000/api/equipment

// Debug logging (only works in development)
debugLog('Component loaded', { apiUrl });
```

### 3. Available Helpers

- `config.API_BASE_URL` - Base API URL
- `getEndpointUrl('ENDPOINT_KEY')` - Get full URL for specific endpoint
- `debugLog(message, data)` - Debug logging (only in development)

## Benefits

1. **Centralized Management** - All configuration in one place
2. **Environment Flexibility** - Easy to switch between dev/prod
3. **Type Safety** - Consistent configuration structure  
4. **Debug Control** - Conditional logging based on environment
5. **Fallback Values** - Default values if env variables are missing

## Usage Examples

```javascript
// Before (old way)
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
await axios.get(`${API_BASE_URL}/api/equipment`);

// After (new way)
import { getEndpointUrl } from './config/config';
await axios.get(getEndpointUrl('EQUIPMENT'));